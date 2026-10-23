/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-auth-exchange.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// POST /api/auth/exchange: a GoTrue access token earned by a PASSWORDLESS sign-in (email OTP or
// OAuth, both done in the browser against Kong) becomes an osionos session.
//
// Why this is narrow: the GoTrue password grant is public on Kong and skips Turnstile, so a
// password-earned token must never be exchangeable. The proof is read from the token's verified
// `amr` claim (GoTrue v2.188.1 emits [{method, timestamp}]) and its `iat`; the recorded
// authMethod is derived from that claim, never from the body, which holds exactly {accessToken}.
// The token is verified by GoTrue itself (GET /auth/v1/user), not by this file.
//
// Caveat: `amr` and `iat` are read from the token's payload after GoTrue accepted the token,
// so they are as honest as GoTrue. A token minted by a passwordless step and then refreshed has
// `token_refresh` as its newest method and is refused: the user signs in again. The per-IP
// bucket is the socket peer unless OSIONOS_CLIENT_IP_HEADER names a header, so behind a proxy
// without it every caller shares one bucket and the 20-call window can be spent by one client.

import { createHash } from 'node:crypto';
import { clientMeta, rateLimit, writeAudit } from './bridge-guard.mjs';
import { clientMetaOf } from './bridge-account-sudo.mjs';
import { readJsonBody, sendJson } from './bridge-social-core.mjs';

export const EXCHANGE_PATH = '/api/auth/exchange';
const BODY_LIMIT_BYTES = 4096;
const MAX_PROOF_AGE_S = 300;
const MAX_CLOCK_SKEW_S = 30;
const IP_LIMIT = 20;
const USER_LIMIT = 10;
const WINDOW_MS = 600_000;
const GOTRUE_TIMEOUT_MS = 8_000;
// GoTrue's amr method -> the authMethod bridge-sessions records.
const METHOD_TO_AUTH = new Map([['oauth', 'oauth'], ['otp', 'email_otp']]);
const REFUSED = 'The sign-in could not be verified; sign in again.';

function exchangeError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

const refusedProof = () => exchangeError(401, 'invalid_provider_token', REFUSED);

function requestedToken(body) {
	const keys = body !== null && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
	if (keys.length !== 1 || keys[0] !== 'accessToken' || typeof body.accessToken !== 'string' || body.accessToken === '') {
		throw exchangeError(422, 'invalid_exchange_request', 'The body must be exactly {accessToken}.');
	}
	return body.accessToken;
}

function payloadOf(token) {
	const parts = token.split('.');
	if (parts.length !== 3) throw refusedProof();
	try {
		const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
		if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) return payload;
	} catch { /* unreadable payload falls through to the refusal */ }
	throw refusedProof();
}

/** The authMethod of the NEWEST amr entries, or a refusal; an unreadable claim is never a guess. */
export function authMethodFromClaims(payload, nowSeconds) {
	const { amr, iat } = payload;
	if (!Number.isFinite(iat) || nowSeconds - iat > MAX_PROOF_AGE_S || iat - nowSeconds > MAX_CLOCK_SKEW_S) throw refusedProof();
	if (!Array.isArray(amr) || amr.length === 0) throw refusedProof();
	if (!amr.every((entry) => typeof entry?.method === 'string' && Number.isFinite(entry.timestamp))) throw refusedProof();
	const newest = Math.max(...amr.map((entry) => entry.timestamp));
	const methods = new Set(amr.filter((entry) => entry.timestamp === newest).map((entry) => entry.method));
	if (methods.size !== 1) throw refusedProof();
	const authMethod = METHOD_TO_AUTH.get([...methods][0]);
	if (!authMethod) throw refusedProof();
	return authMethod;
}

async function gotrueUserId(token, { config, fetchImpl }) {
	let response;
	try {
		response = await fetchImpl(`${config.baasUrl}/auth/v1/user`, {
			headers: { Authorization: `Bearer ${token}`, apikey: config.publicApiKey },
			signal: AbortSignal.timeout(GOTRUE_TIMEOUT_MS),
		});
	} catch {
		throw exchangeError(503, 'exchange_unavailable', 'The sign-in service is unavailable; try again shortly.');
	}
	if (response.status >= 500) throw exchangeError(503, 'exchange_unavailable', 'The sign-in service is unavailable; try again shortly.');
	const user = response.ok ? await response.json().catch(() => null) : null;
	if (typeof user?.id !== 'string' || user.id === '') throw refusedProof();
	return user.id;
}

async function exchange(request, response, deps) {
	const { config, kv } = deps;
	if (!config.publicApiKey) throw exchangeError(503, 'exchange_unconfigured', 'Passwordless sign-in is not configured on this server.');
	const peer = clientMeta(request, { ipHeader: config.clientIpHeader, hashSecret: config.ipHashSecret });
	await rateLimit(kv, ['auth-exchange-ip', peer.ipHash ?? peer.ipPrefix ?? 'unknown'], { limit: IP_LIMIT, windowMs: WINDOW_MS });
	const token = requestedToken(await readJsonBody(request, BODY_LIMIT_BYTES));
	const userId = await gotrueUserId(token, deps);
	deps.subject.id = userId;
	await rateLimit(kv, ['auth-exchange-user', userId], { limit: USER_LIMIT, windowMs: WINDOW_MS });
	const payload = payloadOf(token);
	if (payload.sub !== userId) throw refusedProof();
	// Single use: one token mints one session, so a fragment-borne OAuth token cannot be replayed.
	const digest = createHash('sha256').update(token).digest('hex');
	if (!await kv.setNx(`auth-exchange-used:${digest}`, '1', MAX_PROOF_AGE_S * 1000)) throw refusedProof();
	const authMethod = authMethodFromClaims(payload, Math.floor(Date.now() / 1000));
	const consumed = await deps.establishSession({ request, gatewayToken: token, authMethod, expectedUserId: userId });
	sendJson(response, 200, {
		user: { id: userId, email: typeof consumed.persona?.email === 'string' ? consumed.persona.email : '' },
		accessToken: consumed.session.accessToken,
		// The bridge's rotating refresh token; the gateway's own is never forwarded.
		refreshToken: consumed.session.refreshToken ?? '',
		workspaceIds: Array.isArray(consumed.persona?.workspaceIds) ? consumed.persona.workspaceIds : [],
		session: consumed.session,
	}, config);
}

// Logged at info level: an operator's boot-line checks count warn lines.
export function clientIpBootWarning(config) {
	return config.clientIpHeader ? '' : '[osionos-bridge] WARNING: OSIONOS_BRIDGE_CLIENT_IP_HEADER is unset: behind a proxy every caller shares one auth-exchange rate bucket.';
}

/** Never lets a failing audit write hide the refusal it was recording. */
async function auditRefusal(error, request, { config, pg, subject }) {
	const session = { userId: subject.id };
	const details = { reason: error.code ?? 'exchange_failed', status: error.status };
	try {
		await writeAudit(pg, { session, meta: clientMetaOf(request, config), eventType: 'auth.exchange_refused', details });
	} catch (auditError) {
		console.warn(`[osionos-bridge] auth exchange refusal (${details.reason}) could not be audited: ${auditError.code ?? 'audit_failed'}`);
	}
}

/**
 * deps: { config, kv, pg, fetchImpl, establishSession }. `establishSession` is bridge-api's gateway
 * handoff, injected because this file cannot import bridge-api without a cycle.
 */
export async function handleAuthExchange(request, response, deps) {
	const subject = { id: null };
	try {
		await exchange(request, response, { ...deps, subject });
	} catch (error) {
		// Audited only once GoTrue has named the user: an anonymous caller must not be able to write rows,
		// and the limiter's own 429 is not an event worth a row.
		if (subject.id && Number.isInteger(error?.status) && error.status !== 429) await auditRefusal(error, request, { ...deps, subject });
		throw error;
	}
}
