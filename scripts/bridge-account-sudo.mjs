/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-sudo.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The step-up proof of the account plane: a code mailed to the account's own address,
 * checked against grobase's signed proof, and then a sudo grant on the session.
 *
 * The address NEVER comes from the request: the bridge reads it from GoTrue's admin
 * route with the service key (the call shape of bridge-workspace-invites.mjs), so a body
 * cannot choose where a code goes, and the client only ever sees the masked form.
 *
 * grobase's login-OTP service answers `POST /v1/auth/otp/request` with {sent:true} and
 * `POST /v1/auth/otp/verify` with {verified:true, proof}. The proof is an HS256 JWT
 * signed with the GoTrue secret — the same JWT_SECRET the bridge mints its own account
 * tokens with (bridge-pg.mjs:174) — whose claims are {otp, aud:'otp-proof', iat, exp}.
 * The bridge checks the proof instead of trusting it, and spends it: the proof is marked
 * used in the shared store before the grant, so a replay answers 502. The grant is
 * bridge-guard's (a `sudo:<jti>` key, ten minutes), so sudo is per session.
 *
 * Caveat: a step-up code and a pending sign-in code for the same address share
 * grobase's store, and a new request supersedes the old code — so asking for a step-up
 * code cancels an in-flight sign-in code for that address. Only the holder of that
 * session can cause it (the address comes from GoTrue) and the send limit bounds it.
 *
 * Caveat: Kong throttles the request route per IP (policy local, limit_by ip, minute 30,
 * hour 200 — apps/grobase/infra/docker/services/kong/conf/kong.yml:550-553). Every
 * step-up leaves the bridge's own address, so that cap is stack-wide per Kong node: a
 * busy stack refuses every step-up with 503, not only the one that filled the window.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { clientMeta, grantSudo, rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { bearerToken, readJsonBody, sendJson } from './bridge-social-core.mjs';

const EMAIL_PATH = '/api/account/sudo/email';
const VERIFY_PATH = '/api/account/sudo/verify';
const SUDO_PATHS = new Set([EMAIL_PATH, VERIFY_PATH, '/api/account/sudo']);
const POST_ONLY = new Set([EMAIL_PATH, VERIFY_PATH]);
const SEND_LIMIT = 5;
const SEND_WINDOW_MS = 600_000;
const SUDO_TTL_MS = 600_000;
const PROOF_AUDIENCE = 'otp-proof';
const OTP_TIMEOUT_MS = 8_000;
const BODY_LIMIT = 4 * 1024;
const CODE_SHAPE = /^[0-9]{6}$/;
const ADDRESS_SHAPE = /^[^\s@]+@[^\s@]+$/;
const UNAVAILABLE = 'The step-up service is unavailable; try again shortly.';
const BAD_PROOF = 'The step-up could not be verified; ask for a new code.';
const NO_ADDRESS = 'This account has no address to send a code to.';
// The fields an error may carry besides its code, so a route that knows more can say it.
const EXTRA_FIELDS = ['retryAfterSeconds', 'requestedAt', 'scheduledFor'];

export const accountError = (status, code, message, extra) => Object.assign(new Error(message), { status, code }, extra);

export function respondWithError(response, error, config) {
	const status = Number.isInteger(error?.status) ? error.status : 500;
	const code = typeof error?.code === 'string' && /^[a-z][a-z0-9_]*$/.test(error.code) ? error.code : 'account_request_failed';
	const body = { ok: false, message: error instanceof Error ? error.message : 'The request failed.', code };
	for (const key of EXTRA_FIELDS) if (error?.[key] !== undefined) body[key] = error[key];
	if (Number.isFinite(error?.retryAfterSeconds)) response.setHeader('retry-after', String(error.retryAfterSeconds));
	return sendJson(response, status, body, config);
}

export function callerSession(request, config, verifySession) {
	try {
		return verifySession(bearerToken(request), config);
	} catch (error) {
		if (error?.status === 401 && !error?.code) throw accountError(401, 'not_authenticated', error?.message ?? 'An app session is required.');
		throw error;
	}
}

/** The client metadata of the request: without a configured header the IP columns stay
 *  blank, because the socket peer is the proxy and every row would record its /24. */
export function clientMetaOf(request, config) {
	const meta = clientMeta(request, { ipHeader: config.clientIpHeader, hashSecret: config.ipHashSecret });
	if (!config.clientIpHeader) { meta.ipPrefix = null; meta.ipHash = null; }
	return meta;
}

export async function readBody(request, limit = BODY_LIMIT) {
	try {
		return await readJsonBody(request, limit);
	} catch (error) {
		const tooBig = error?.status === 413;
		throw accountError(tooBig ? 413 : 400, tooBig ? 'payload_too_large' : 'invalid_json', tooBig ? 'The body is larger than the limit.' : 'The request body must be JSON.');
	}
}

export function noContent(response, config) {
	response.writeHead(204, { 'cache-control': 'no-store', 'access-control-allow-origin': config.allowedOrigin, 'access-control-allow-credentials': 'true', vary: 'Origin' });
	response.end();
	return true;
}

/**
 * The masked form of an address: the first character of the local part, the first
 * character of the first domain label, and the last label — `dylan@gmail.com` reads
 * `d•••@g•••.com`. An address with no dot after the `@` has no last label.
 */
export function maskAddress(value) {
	const address = String(value ?? '').trim();
	const at = address.lastIndexOf('@');
	if (at < 1) return '•••';
	const labels = address.slice(at + 1).split('.');
	const first = labels[0] ?? '';
	const last = labels.length > 1 ? labels[labels.length - 1] : '';
	return `${address.slice(0, 1)}•••@${first.slice(0, 1)}•••${last ? `.${last}` : ''}`;
}

/** The secret the proof is signed with — the one the bridge mints its tokens with. */
function proofSecret(env) {
	const secret = String(env?.JWT_SECRET ?? '').trim();
	if (!secret) throw accountError(503, 'sudo_unavailable', UNAVAILABLE);
	return secret;
}

/** One call to grobase, or the failure that says the step-up is unavailable. */
async function grobase(config, fetchImpl, path, { method = 'GET', body, headers = {} } = {}) {
	try {
		return await fetchImpl(`${config.baasUrl}${path}`, {
			method,
			headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(OTP_TIMEOUT_MS),
		});
	} catch { throw accountError(503, 'sudo_unavailable', UNAVAILABLE); }
}

/** The address GoTrue holds for this user, or the failure that says there is none. */
async function accountAddress({ config, fetchImpl }, userId) {
	if (!config.baasUrl || !config.serviceKey) throw accountError(503, 'sudo_unavailable', UNAVAILABLE);
	const response = await grobase(config, fetchImpl, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
		headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
	});
	if (response.status === 404) throw accountError(409, 'no_email', NO_ADDRESS);
	if (!response.ok) throw accountError(503, 'sudo_unavailable', UNAVAILABLE);
	const payload = await response.json().catch(() => null);
	const address = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
	if (!address || !ADDRESS_SHAPE.test(address)) throw accountError(409, 'no_email', NO_ADDRESS);
	return address;
}

/** Ask grobase to mail the code. Its own throttling (Kong) is not the user's limit. */
async function requestCode({ config, fetchImpl }, address) {
	const response = await grobase(config, fetchImpl, '/v1/auth/otp/request', {
		method: 'POST',
		body: { email: address },
		headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
	});
	if (response.status === 429) {
		const retryAfter = Number(response.headers.get('retry-after'));
		throw accountError(503, 'sudo_unavailable', UNAVAILABLE, Number.isFinite(retryAfter) ? { retryAfterSeconds: retryAfter } : {});
	}
	if (!response.ok) throw accountError(503, 'sudo_unavailable', UNAVAILABLE);
	const payload = await response.json().catch(() => null);
	if (payload?.sent !== true) throw accountError(503, 'sudo_unavailable', UNAVAILABLE);
}

/** The proof grobase answers with, or the failure that says the code was not accepted. */
async function verifyCode({ config, fetchImpl }, address, code) {
	const response = await grobase(config, fetchImpl, '/v1/auth/otp/verify', { method: 'POST', body: { email: address, code } });
	// 401 is the wrong code, not a session problem: the client reads a 401 as "sign in
	// again", and the session is fine.
	if (response.status === 401) throw accountError(422, 'code_invalid', 'That code is not the right one.');
	if (response.status === 410) throw accountError(410, 'code_expired', 'That code has expired; ask for a new one.');
	if (response.status === 429) throw accountError(429, 'code_locked', 'Too many attempts; ask for a new code.');
	if (!response.ok) throw accountError(503, 'sudo_unavailable', UNAVAILABLE);
	const payload = await response.json().catch(() => null);
	return typeof payload?.proof === 'string' ? payload.proof : '';
}

/**
 * The proof is CHECKED, not trusted: the algorithm is exactly HS256, the signature
 * verifies against the GoTrue secret, the audience is the proof one, the expiry is in
 * the future and the address is the one the code went to. A failure is a fault of
 * grobase or of the secret, never of the user's, so it is a 502.
 */
function checkProof(proof, { secret, address, now }) {
	const parts = String(proof ?? '').split('.');
	if (parts.length !== 3) return null;
	let header;
	let claims;
	try {
		header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
		claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	if (!header || typeof header !== 'object' || Array.isArray(header)) return null;
	if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return null;
	if (header.alg !== 'HS256') return null;
	let expected;
	let given;
	try {
		expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
		given = Buffer.from(parts[2], 'base64url');
	} catch {
		return null;
	}
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	if (claims.aud !== PROOF_AUDIENCE) return null;
	const exp = Number(claims.exp);
	if (!Number.isFinite(exp) || exp * 1000 <= now) return null;
	if (String(claims.otp ?? '').toLowerCase() !== address.toLowerCase()) return null;
	return { exp };
}

/** The audit row of an attempt. The address is never in it. */
const auditSudo = (pg, session, request, config, eventType) =>
	writeAudit(pg, { session, meta: clientMetaOf(request, config), eventType, details: { method: 'email' } });

/** The moment the grant ends, kept beside it for the interface. */
async function rememberExpiry(kv, session, now) {
	const jti = session?.raw?.jti;
	if (typeof jti !== 'string' || jti === '') return;
	// The expiry is a convenience for the interface; the grant itself is what matters.
	await kv.set(`sudo-expires:${jti}`, new Date(now + SUDO_TTL_MS).toISOString(), SUDO_TTL_MS).catch(() => {});
}

async function sendCode({ config, kv, fetchImpl, pg }, session, request, response, clientConfig) {
	await rateLimit(kv, ['sudo-email', session.userId], { limit: SEND_LIMIT, windowMs: SEND_WINDOW_MS });
	const address = await accountAddress({ config, fetchImpl }, session.userId);
	await auditSudo(pg, session, request, config, 'sudo.code_sent');
	await requestCode({ config, fetchImpl }, address);
	return sendJson(response, 202, { method: 'email', sentTo: maskAddress(address) }, clientConfig);
}

async function verifySudo({ config, kv, fetchImpl, now, pg, secret }, session, request, response, clientConfig) {
	const body = await readBody(request);
	const code = typeof body?.code === 'string' ? body.code.trim() : '';
	if (!CODE_SHAPE.test(code)) throw accountError(422, 'code_invalid', 'The code must be six digits.');
	const address = await accountAddress({ config, fetchImpl }, session.userId);
	const proof = await verifyCode({ config, fetchImpl }, address, code);
	const checked = checkProof(proof, { secret, address, now });
	// The proof is spent before the grant: a replay is refused even if the grant failed.
	const marker = `otp-proof:${createHash('sha256').update(proof).digest('hex')}`;
	let fresh;
	try {
		fresh = checked ? await kv.setNx(marker, '1', Math.max(1, Math.floor(checked.exp * 1000 - now))) : false;
	} catch {
		throw accountError(503, 'sudo_unavailable', UNAVAILABLE);
	}
	await auditSudo(pg, session, request, config, fresh ? 'sudo.granted' : 'sudo.proof_rejected');
	if (!fresh) throw accountError(502, 'sudo_proof_invalid', BAD_PROOF);
	try {
		await grantSudo(kv, session, SUDO_TTL_MS);
	} catch {
		// The code is spent: the user asks for a new one. That is the price of a
		// single-use proof, and it is cheaper than a proof that can be replayed.
		throw accountError(503, 'sudo_unavailable', 'The step-up could not be granted; request a new code.');
	}
	await rememberExpiry(kv, session, now);
	return noContent(response, clientConfig);
}

async function sudoState({ kv }, session, response, clientConfig) {
	let active = false;
	try {
		await requireSudo(kv, session);
		active = true;
	} catch (error) {
		if (error?.status !== 403) throw error;
	}
	const jti = session?.raw?.jti;
	const expiresAt = active && typeof jti === 'string' ? await kv.get(`sudo-expires:${jti}`) : null;
	const body = typeof expiresAt === 'string' && expiresAt !== '' ? { active, expiresAt } : { active };
	return sendJson(response, 200, body, clientConfig);
}

/**
 * The step-up routes of the account plane: the code request, the code verify and the
 * state of the grant. It answers true when it handled the request and false when the
 * path is not its own.
 */
export function createAccountSudoRoutes({ config, pg, kv, verifySession, env = process.env, fetchImpl = null, now = null }) {
	const clock = typeof now === 'function' ? now : () => Date.now();
	const call = typeof fetchImpl === 'function' ? fetchImpl : (url, init) => globalThis.fetch(url, init);
	return async function handleAccountSudo(url, request, response) {
		const pathname = url.pathname;
		const method = (request.method || 'GET').toUpperCase();
		if (!SUDO_PATHS.has(pathname)) return false;
		try {
			const session = callerSession(request, config, verifySession);
			// Without the secret the proof can never be checked, so the whole step-up is
			// unavailable — and no code is sent either.
			const deps = { config, kv, fetchImpl: call, now: clock(), pg, secret: proofSecret(env) };
			if (method !== (POST_ONLY.has(pathname) ? 'POST' : 'GET')) throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
			if (pathname === EMAIL_PATH) return await sendCode(deps, session, request, response, config);
			if (pathname === VERIFY_PATH) return await verifySudo(deps, session, request, response, config);
			return await sudoState(deps, session, response, config);
		} catch (error) {
			return respondWithError(response, error, config);
		}
	};
}
