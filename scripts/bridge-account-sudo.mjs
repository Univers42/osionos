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

import { clientMeta, grantSudo, rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { createOtpClient } from './bridge-account-otp.mjs';
import { readGotrueUser } from './bridge-gotrue-user.mjs';
import { bearerToken, readJsonBody, sendJson } from './bridge-social-core.mjs';

const EMAIL_PATH = '/api/account/sudo/email';
const VERIFY_PATH = '/api/account/sudo/verify';
const SUDO_PATHS = new Set([EMAIL_PATH, VERIFY_PATH, '/api/account/sudo']);
const POST_ONLY = new Set([EMAIL_PATH, VERIFY_PATH]);
const SEND_LIMIT = 5;
const SEND_WINDOW_MS = 600_000;
const SUDO_TTL_MS = 600_000;
const BODY_LIMIT = 4 * 1024;
const CODE_SHAPE = /^[0-9]{6}$/;
const ADDRESS_SHAPE = /^[^\s@]+@[^\s@]+$/;
const UNAVAILABLE = 'The step-up service is unavailable; try again shortly.';
const NO_ADDRESS = 'This account has no address to send a code to.';
// The fields an error may carry besides its code, so a route that knows more can say it.
const EXTRA_FIELDS = ['retryAfterSeconds', 'requestedAt', 'scheduledFor'];

export const accountError = (status, code, message, extra) => Object.assign(new Error(message), { status, code }, extra);

const { requestCode, verifyCode, checkProof, spendProof } = createOtpClient({ fail: accountError, codes: { unavailable: 'sudo_unavailable', proofInvalid: 'sudo_proof_invalid' } });

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

/** The address GoTrue holds for this user, or the failure that says there is none. */
export async function accountAddress(deps, userId) {
	let payload;
	try {
		payload = await readGotrueUser(deps, userId);
	} catch (error) {
		if (error?.upstreamStatus === 404) throw accountError(409, 'no_email', NO_ADDRESS);
		throw accountError(503, 'sudo_unavailable', UNAVAILABLE);
	}
	const address = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : '';
	if (!address || !ADDRESS_SHAPE.test(address)) throw accountError(409, 'no_email', NO_ADDRESS);
	return address;
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
	await spendProof(kv, proof, checked, now, (fresh) => auditSudo(pg, session, request, config, fresh ? 'sudo.granted' : 'sudo.proof_rejected'));
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
