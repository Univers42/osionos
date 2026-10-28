/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-whiteboard-token.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The whiteboard token: what the hydrawn frame carries to /api/whiteboard/v1/*, and nothing else.
 *
 * The osionos page asks for one with its session and posts it down into the hydrawn frame,
 * which runs on another origin. It is not the session (C598): its own prefix and a key derived
 * for this use alone, so neither verifies as the other. It carries the session's jti and issue
 * time, so a sign-out or a revoked session ends it as it ends the session, and it lives
 * WHITEBOARD_TOKEN_TTL_SECONDS at most.
 */

import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { UUID_REGEX, safeCompareText } from './bridge-session-token.mjs';
import { assertSessionNotCutOff, tokenIssuedAtMs } from './bridge-session-cutoff.mjs';
import { assertSessionNotRevoked } from './bridge-session-revocations.mjs';

export const WHITEBOARD_TOKEN_VERSION = 'hydrawn_v1';
export const WHITEBOARD_TOKEN_TTL_SECONDS = 300;
const AUDIENCE = 'hydrawn';

function unauthorized(message) {
	return Object.assign(new Error(message), { status: 401 });
}

function tokenKey(config) {
	if (!config.appSessionSecret) throw Object.assign(new Error('osionos app session secret is not configured.'), { status: 503 });
	return createHmac('sha256', config.appSessionSecret).update('osionos-whiteboard-token-key-v1').digest();
}

/**
 * A token for the verified session `session` (verifyAppSessionToken's result). Never longer
 * than the session itself has left.
 */
export function signWhiteboardToken(session, config, now = Date.now()) {
	const iat = Math.floor(now / 1000);
	const sessionExp = Number(session.raw?.exp);
	const exp = Math.min(iat + WHITEBOARD_TOKEN_TTL_SECONDS, Number.isFinite(sessionExp) ? sessionExp : iat);
	const payload = {
		iss: 'osionos-bridge',
		aud: AUDIENCE,
		scope: 'whiteboard',
		sub: session.userId,
		jti: String(session.raw?.jti ?? ''),
		iat_ms: tokenIssuedAtMs(session.raw ?? {}),
		exp,
	};
	const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const signature = createHmac('sha256', tokenKey(config)).update(encoded).digest('base64url');
	return { token: `${WHITEBOARD_TOKEN_VERSION}.${encoded}.${signature}`, exp };
}

function readPayload(encoded) {
	try {
		const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
		if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload;
	} catch {
		// Falls through to the refusal below: a payload that is not JSON is not a token.
	}
	throw unauthorized('Whiteboard token payload is invalid.');
}

/** The user a whiteboard token acts for; 401 for anything else, the session token included. */
export function verifyWhiteboardToken(token, config, now = config?.sessionCutoffs?.now?.() ?? Date.now()) {
	const parts = String(token ?? '').split('.');
	const [version, encoded, signature] = parts;
	if (parts.length !== 3 || version !== WHITEBOARD_TOKEN_VERSION || !encoded || !signature) {
		throw unauthorized('Whiteboard token is invalid.');
	}
	const expected = createHmac('sha256', tokenKey(config)).update(encoded).digest('base64url');
	if (!safeCompareText(signature, expected)) throw unauthorized('Whiteboard token signature is invalid.');
	const payload = readPayload(encoded);
	if (payload.iss !== 'osionos-bridge' || payload.aud !== AUDIENCE || payload.scope !== 'whiteboard') {
		throw unauthorized('Whiteboard token audience is invalid.');
	}
	const userId = String(payload.sub ?? '').toLowerCase();
	if (!UUID_REGEX.test(userId)) throw unauthorized('Whiteboard token subject is invalid.');
	if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(now / 1000)) {
		throw unauthorized('Whiteboard token has expired.');
	}
	assertSessionNotCutOff(config.sessionCutoffs, userId, tokenIssuedAtMs(payload));
	assertSessionNotRevoked(config.sessionRevocations, String(payload.jti ?? '').toLowerCase());
	return { userId };
}
