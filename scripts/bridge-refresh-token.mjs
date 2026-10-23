/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-refresh-token.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The refresh token: `osb_rt.<payload>.<hmac>`, signed with the app-session secret. The
 * signature carries the family, the expiry and the claims the next access token repeats;
 * the row keeps only sha256(token), which is both the lookup key and the single-use proof.
 * The raw token is never stored, logged or audited.
 *
 * Caveat: the token repeats the workspace roles of the sign-in, so a role change lands on
 * the next sign-in, not on the next refresh. The family's lifetime is absolute (the root
 * access token's expiry plus the TTL): rotating never extends it.
 */

import { createHash, createHmac } from 'node:crypto';
import { UUID_REGEX, safeCompareText } from './bridge-session-token.mjs';

export const REFRESH_TOKEN_PREFIX = 'osb_rt';
export const DEFAULT_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_TOKEN_CHARS = 8192;

/** OSIONOS_BRIDGE_REFRESH_TTL_SECONDS in seconds; a non-positive or non-numeric value is the default. */
export function refreshTtlSeconds(env = process.env) {
	const parsed = Number(env?.OSIONOS_BRIDGE_REFRESH_TTL_SECONDS);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_REFRESH_TTL_SECONDS;
}

export function hashRefreshToken(token) {
	return createHash('sha256').update(String(token)).digest('hex');
}

function sign(config, encodedPayload) {
	return createHmac('sha256', config.appSessionSecret).update(encodedPayload).digest('base64url');
}

/**
 * Mints a refresh token. `claims.familyExp` is the absolute expiry in epoch seconds
 * (`familyRefreshExp` at a sign-in, the parent's own `exp` at a rotation).
 */
export function mintRefreshToken({ config, now = Date.now(), claims }) {
	const payload = {
		iss: 'osionos-bridge',
		aud: 'osionos-refresh',
		sub: claims.sub,
		fam: claims.fam,
		jti: claims.jti,
		iat: Math.floor(now / 1000),
		exp: claims.familyExp,
		provider: claims.provider,
		email: claims.email ?? '',
		name: claims.name ?? '',
		workspace_ids: claims.workspace_ids,
		roles: claims.roles,
		platform_role: claims.platform_role ?? null,
		is_admin: claims.is_admin === true,
	};
	const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const token = `${REFRESH_TOKEN_PREFIX}.${encoded}.${sign(config, encoded)}`;
	return { token, expiresAt: new Date(payload.exp * 1000).toISOString(), hash: hashRefreshToken(token) };
}

/**
 * The refresh expiry of a new family: its root access token's expiry plus the TTL.
 * Caveat: the TTL env var is read at each sign-in (configFromEnv is not this file's), so
 * changing it affects new families only, never a family already issued.
 */
export function familyRefreshExp(config, accessExp) {
	return accessExp + (config.refreshTtlSeconds ?? refreshTtlSeconds());
}

function isUuid(value) {
	return typeof value === 'string' && UUID_REGEX.test(value);
}

function payloadOf(token, config) {
	const parts = String(token ?? '').split('.');
	if (parts.length !== 3 || parts[0] !== REFRESH_TOKEN_PREFIX || String(token).length > MAX_TOKEN_CHARS) return null;
	if (!parts[1] || !safeCompareText(parts[2], sign(config, parts[1]))) return null;
	try {
		const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
		return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
	} catch {
		return null;
	}
}

function wellFormed(payload) {
	return payload.iss === 'osionos-bridge' && payload.aud === 'osionos-refresh'
		&& isUuid(payload.sub) && isUuid(payload.fam) && isUuid(payload.jti)
		&& Number.isFinite(payload.exp)
		&& Array.isArray(payload.workspace_ids) && payload.workspace_ids.length > 0 && payload.workspace_ids.every(isUuid)
		&& payload.roles !== null && typeof payload.roles === 'object' && !Array.isArray(payload.roles);
}

/**
 * Reads a presented token: `{ payload }`, or `{ code }` naming why it is refused. Nothing
 * is thrown, so a hostile string can only ever become a 401.
 */
export function readRefreshToken(token, config, now = Date.now()) {
	const payload = config.appSessionSecret ? payloadOf(token, config) : null;
	if (!payload || !wellFormed(payload)) return { code: 'refresh_token_invalid' };
	if (payload.exp <= Math.floor(now / 1000)) return { code: 'refresh_token_expired' };
	return { payload };
}
