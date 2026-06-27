/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-oauth.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Universal Connector — OAuth broker + MOCK authorization server (§6.3/§6.4).
 *
 * The token EXCHANGE happens here (server-side) and the access/refresh tokens are
 * held in this Node process keyed by an opaque CredentialRef. The browser never
 * receives a token — `exchange` returns only `{ ok, credentialRef }`. The token
 * endpoint enforces PKCE (S256). Swap the mock AS for a real provider by changing
 * the authorize/token URLs — the client adapter contract is unchanged.
 */

import { createHash, randomBytes } from 'node:crypto';
import { bearerToken, readJsonBody } from './bridge-social-core.mjs';

const OAUTH_BODY_LIMIT = 16 * 1024;
const PENDING_TTL_MS = 60_000; // an auth code is short-lived
const MAX_PENDING = 1000; // cap unauthenticated authorize growth (DoS guard)
const MAX_TOKENS = 5000; // defensive cap on stored credentials
const AUTHORIZED = new Set([
	'/api/connector/oauth/exchange',
	'/api/connector/oauth/validate',
	'/api/connector/oauth/disconnect',
]);

/** Drop expired entries and bound the map size (evict oldest = insertion order). */
function pruneMap(map, ttlField, now, maxSize) {
	for (const [key, value] of map) {
		if (ttlField && value?.[ttlField] !== undefined && value[ttlField] <= now) map.delete(key);
	}
	while (map.size > maxSize) {
		const oldest = map.keys().next().value;
		if (oldest === undefined) break;
		map.delete(oldest);
	}
}

/** Same-origin redirect allowlist — blocks open-redirect to arbitrary hosts. */
function redirectAllowed(redirectUri, config) {
	try {
		const target = new URL(redirectUri);
		if (config.allowedOrigin && config.allowedOrigin !== '*') return target.origin === config.allowedOrigin;
		return target.hostname === 'localhost' || target.hostname === '127.0.0.1';
	} catch {
		return false;
	}
}

function b64url(buffer) {
	return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
function s256(verifier) {
	return b64url(createHash('sha256').update(String(verifier ?? '')).digest());
}
function respondJson(response, status, body, config) {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end(JSON.stringify(body));
	return true;
}

export function createOAuthHandler({ config, verifySession } = {}) {
	const pendingCodes = new Map(); // code → { codeChallenge, state }
	const tokens = new Map(); // credentialRef.handle → { providerKey, accessToken, refreshToken }

	return async function handleOAuthRoute(url, request, response, requestConfig = config) {
		const path = url.pathname;

		// Mock AS authorize (browser GET): mint a code bound to the PKCE challenge,
		// then redirect back to the app callback (or return JSON when no redirect_uri).
		// Disabled when a real provider is configured (oauthMockEnabled === false).
		if (path === '/api/connector/oauth/mock/authorize' && (request.method || 'GET').toUpperCase() === 'GET') {
			if (requestConfig.oauthMockEnabled === false) return respondJson(response, 404, { ok: false, message: 'Mock OAuth is disabled.' }, requestConfig);
			const now = Date.now();
			pruneMap(pendingCodes, 'expiresAt', now, MAX_PENDING);
			const q = url.searchParams;
			const state = q.get('state') ?? '';
			const codeChallenge = q.get('code_challenge') ?? '';
			const redirectUri = q.get('redirect_uri') ?? '';
			const code = b64url(randomBytes(18));
			pendingCodes.set(code, { codeChallenge, state, expiresAt: now + PENDING_TTL_MS });
			if (redirectUri && redirectAllowed(redirectUri, requestConfig)) {
				const to = new URL(redirectUri);
				to.searchParams.set('code', code);
				to.searchParams.set('state', state);
				response.writeHead(302, { location: to.toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
				response.end();
				return true;
			}
			return respondJson(response, 200, { code, state }, requestConfig);
		}

		if (!AUTHORIZED.has(path)) return false;
		if ((request.method || 'GET').toUpperCase() !== 'POST') return false;
		try {
			verifySession(bearerToken(request), requestConfig);
		} catch (error) {
			return respondJson(response, error?.status ?? 401, { ok: false, message: 'Authentication required.' }, requestConfig);
		}
		let body;
		try {
			body = await readJsonBody(request, OAUTH_BODY_LIMIT);
		} catch {
			return respondJson(response, 400, { ok: false, message: 'Invalid request body.' }, requestConfig);
		}

		if (path === '/api/connector/oauth/exchange') {
			const record = pendingCodes.get(body?.code);
			pendingCodes.delete(body?.code); // single-use (burn even on failure)
			if (!record || record.expiresAt <= Date.now()) return respondJson(response, 200, { ok: false, code: 'invalid_credential', message: 'Unknown, expired, or already-used code.' }, requestConfig);
			if (s256(body?.codeVerifier) !== record.codeChallenge) {
				return respondJson(response, 200, { ok: false, code: 'invalid_credential', message: 'PKCE verification failed.' }, requestConfig);
			}
			pruneMap(tokens, undefined, Date.now(), MAX_TOKENS);
			const handle = `oauth:${String(body?.providerKey || 'provider')}:${b64url(randomBytes(9))}`;
			tokens.set(handle, {
				providerKey: body?.providerKey,
				accessToken: `mock-access-${b64url(randomBytes(12))}`,
				refreshToken: `mock-refresh-${b64url(randomBytes(12))}`,
			});
			// The token NEVER leaves the bridge — only the opaque ref is returned.
			return respondJson(response, 200, { ok: true, credentialRef: { handle } }, requestConfig);
		}

		if (path === '/api/connector/oauth/validate') {
			return respondJson(response, 200, { ok: tokens.has(body?.credentialRef?.handle) }, requestConfig);
		}

		// disconnect
		tokens.delete(body?.credentialRef?.handle);
		return respondJson(response, 200, { ok: true }, requestConfig);
	};
}
