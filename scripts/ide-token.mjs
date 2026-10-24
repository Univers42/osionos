/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-token.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE process accepts only these credentials, never the app token: one user, one workspace,
// at most 15 minutes, signed with a secret the app session never uses. The preview capability is
// narrower still (one port) and is MAC'd with a key derived from that secret, so neither kind of
// credential verifies as the other.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { UUID_REGEX } from './bridge-social-core.mjs';
import { isValidIdeUsername, usernameFromToken } from './ide-username.mjs';

export const IDE_TOKEN_VERSION = 'osionos_ide1';
export const PREVIEW_CAP_VERSION = 'pc1';
export const IDE_TOKEN_MAX_TTL_SECONDS = 900;
export const IDE_SECRET_MIN_BYTES = 32;

const MAX_CREDENTIAL_LENGTH = 4096;
const ISSUER = 'osionos-bridge';
const AUDIENCE = 'osionos-ide';
const SECRET_MISSING = 'The IDE token secret is not configured.';
const TOKEN_INVALID = 'IDE token is invalid.';
const CAP_INVALID = 'Preview link is invalid.';

function fail(message, status) {
	return Object.assign(new Error(message), { status });
}

function isUuid(value) {
	return typeof value === 'string' && UUID_REGEX.test(value);
}

function isPort(value) {
	return Number.isInteger(value) && value >= 1 && value <= 65535;
}

// A caller that passes an empty or short key would mint credentials anyone can forge.
function requireKey(secret) {
	if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < IDE_SECRET_MIN_BYTES) {
		throw fail(SECRET_MISSING, 503);
	}
	return secret;
}

function previewKey(secret) {
	return createHmac('sha256', requireKey(secret)).update('osio-ide-preview-v1').digest();
}

function requireIds(userId, workspaceId) {
	if (!isUuid(userId)) throw fail('userId must be a UUID.', 400);
	if (!isUuid(workspaceId)) throw fail('workspaceId must be a UUID.', 400);
}

function mac(key, version, payloadPart) {
	return createHmac('sha256', key).update(`${version}.${payloadPart}`).digest('base64url');
}

function encode(version, key, payload) {
	const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
	return `${version}.${payloadPart}.${mac(key, version, payloadPart)}`;
}

// The signature is compared as the exact base64url text node emits, not as decoded bytes:
// base64url decoding skips characters outside its alphabet, so byte comparison would accept
// several spellings of one credential.
function decodeVerified(credential, version, key, invalid) {
	if (typeof credential !== 'string' || credential.length > MAX_CREDENTIAL_LENGTH) throw fail(invalid, 401);
	const parts = credential.split('.');
	if (parts.length !== 3 || parts.includes('') || parts[0] !== version) throw fail(invalid, 401);
	const given = Buffer.from(parts[2], 'utf8');
	const expected = Buffer.from(mac(key, version, parts[1]), 'utf8');
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw fail(invalid, 401);
	let payload;
	try {
		payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
	} catch {
		throw fail(invalid, 401);
	}
	if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw fail(invalid, 401);
	return payload;
}

export function ideTokenSecret(env) {
	const value = env?.OSIONOS_IDE_TOKEN_SECRET;
	if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') < IDE_SECRET_MIN_BYTES) {
		throw fail(SECRET_MISSING, 503);
	}
	if (value === env?.OSIONOS_APP_SESSION_SECRET) throw fail(SECRET_MISSING, 503);
	return value;
}

export function signIdeToken({ userId, workspaceId, secret, username, now = Date.now(), ttlSeconds = 900, jti = randomUUID() }) {
	requireIds(userId, workspaceId);
	const key = requireKey(secret);
	const iat = Math.floor(now / 1000);
	const ttl = Number.isFinite(ttlSeconds)
		? Math.min(Math.max(1, Math.floor(ttlSeconds)), IDE_TOKEN_MAX_TTL_SECONDS)
		: IDE_TOKEN_MAX_TTL_SECONDS;
	const exp = iat + ttl;
	// `un` rides only when it is already valid; an old reader ignores it and a new reader falls back to coder.
	const un = isValidIdeUsername(username) ? { un: username } : {};
	const token = encode(IDE_TOKEN_VERSION, key, { iss: ISSUER, aud: AUDIENCE, sub: userId, ws: workspaceId, ...un, iat, exp, jti });
	return { token, expiresAt: new Date(exp * 1000).toISOString(), exp };
}

export function verifyIdeToken(token, { secret }, now = Date.now()) {
	const nowSec = Math.floor(now / 1000);
	const payload = decodeVerified(token, IDE_TOKEN_VERSION, requireKey(secret), TOKEN_INVALID);
	const { iss, aud, sub, ws, iat, exp, un } = payload;
	if (iss !== ISSUER || aud !== AUDIENCE || !isUuid(sub) || !isUuid(ws)) throw fail(TOKEN_INVALID, 401);
	if (!Number.isInteger(iat) || !Number.isInteger(exp) || iat > nowSec) throw fail(TOKEN_INVALID, 401);
	if (exp - iat < 1 || exp - iat > IDE_TOKEN_MAX_TTL_SECONDS) throw fail(TOKEN_INVALID, 401);
	if (exp <= nowSec) throw fail('IDE token has expired.', 401);
	return { userId: sub, workspaceIds: [ws], roles: {}, isAdmin: false, exp, username: usernameFromToken(un) };
}

export function signPreviewCap({ userId, workspaceId, port, secret, parentExp, now = Date.now() }) {
	requireIds(userId, workspaceId);
	if (!isPort(port)) throw fail('port must be an integer between 1 and 65535.', 400);
	const key = previewKey(secret);
	const nowSec = Math.floor(now / 1000);
	// A derived credential never outlives the token that asked for it.
	const exp = Math.min(nowSec + IDE_TOKEN_MAX_TTL_SECONDS, parentExp);
	if (!Number.isInteger(exp) || exp <= nowSec) throw fail('Preview link has expired.', 401);
	return { cap: encode(PREVIEW_CAP_VERSION, key, { sub: userId, ws: workspaceId, port, exp }), exp };
}

export function verifyPreviewCap(cap, { secret }, now = Date.now()) {
	const nowSec = Math.floor(now / 1000);
	const { sub, ws, port, exp } = decodeVerified(cap, PREVIEW_CAP_VERSION, previewKey(secret), CAP_INVALID);
	if (!isUuid(sub) || !isUuid(ws) || !isPort(port) || !Number.isInteger(exp)) throw fail(CAP_INVALID, 401);
	if (exp <= nowSec) throw fail('Preview link has expired.', 410);
	return { userId: sub, workspaceId: ws, port, exp };
}
