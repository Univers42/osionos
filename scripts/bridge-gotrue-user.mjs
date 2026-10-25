/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-gotrue-user.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The GoTrue admin read of one user, shared by the routes that need a field of it. The
 * service key never leaves this file: callers get the payload and decide what to project.
 *
 * Caveat: the timeout is 8 s, and every failure (a throw, a timeout, any non-2xx, an
 * unconfigured plane) collapses to one 503 error. A 404 and a 500 differ only in the
 * `upstreamStatus` the error carries, so a caller that treats "no such user" as an answer
 * must check it, or it will report an outage for a missing user.
 */

import { signRealtimeJwt } from './bridge-realtime-socket.mjs';
import { UUID_REGEX } from './bridge-social-core.mjs';

const TIMEOUT_MS = 8_000;
const FAILED = 'The account directory could not be read.';

export function gotrueAdminHeaders(config) {
	return { Accept: 'application/json', apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` };
}

const readFailed = (upstreamStatus) => Object.assign(new Error(FAILED), { status: 503, code: 'gotrue_read_failed', upstreamStatus });

const lookupFailed = (upstreamStatus) => Object.assign(new Error(FAILED), { status: 503, code: 'gotrue_lookup_failed', upstreamStatus });

export async function readGotrueUser({ config, fetchImpl }, userId) {
	if (!config.baasUrl || !config.serviceKey) throw readFailed(null);
	let upstream;
	try {
		upstream = await fetchImpl(`${config.baasUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
			headers: gotrueAdminHeaders(config),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		throw readFailed(null);
	}
	if (!upstream.ok) throw readFailed(upstream.status);
	try {
		return await upstream.json();
	} catch {
		throw readFailed(upstream.status);
	}
}

const writeFailure = (code, upstreamStatus) => Object.assign(new Error('The account directory refused the change.'), { status: 503, code, upstreamStatus });

/**
 * Sets the primary address through the admin route with `email_confirm`, which GoTrue applies at
 * once and mails nobody. Every failure carries a `code` that says whether the write is KNOWN
 * not to have happened: `gotrue_email_taken` (the address is held), `gotrue_write_failed` (a
 * definite 4xx with a GoTrue body), or `gotrue_write_unknown` (a proxy 5xx, a timeout, a
 * non-JSON body: the write may have landed, so the caller must re-read before it decides).
 *
 * Caveat: a 4xx with a JSON body is trusted to come from GoTrue and not from a proxy; a gateway
 * that answers a JSON 4xx for a request it forwarded anyway would be misread as "not applied".
 */
export async function updateGotrueEmail({ config, fetchImpl }, userId, address) {
	if (!config.baasUrl || !config.serviceKey) throw writeFailure('gotrue_write_unknown', null);
	let upstream;
	let payload = null;
	try {
		upstream = await fetchImpl(`${config.baasUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
			method: 'PUT',
			headers: { ...gotrueAdminHeaders(config), 'content-type': 'application/json' },
			body: JSON.stringify({ email: address, email_confirm: true }),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (upstream.ok) return;
		payload = JSON.parse(await upstream.text());
	} catch {
		payload = null; // a network error, a timeout or a non-JSON body is not provably a GoTrue answer
	}
	const { status } = upstream ?? {};
	const named = payload && typeof payload === 'object' ? [payload.code, payload.error_code].map(String) : [];
	if ((status === 500 && named.includes('23505')) || (status === 422 && named.includes('email_exists'))) throw writeFailure('gotrue_email_taken', status);
	const definite = payload && typeof payload === 'object' && status >= 400 && status < 500 && status !== 408 && status !== 429;
	throw writeFailure(definite ? 'gotrue_write_failed' : 'gotrue_write_unknown', status ?? null);
}

const LOOKUP_TIMEOUT_MS = 5_000;
const LOOKUP_PER_PAGE = 50;

/**
 * Resolve one account by email through GoTrue's admin list. The filter is a containment
 * search, so the EXACT case-insensitive match is kept here: `xdylan@gmail.com` never
 * answers for `dylan@gmail.com`. `complete` is false when the page was full, because a
 * full page with no exact match cannot prove the address is absent.
 *
 * Caveat: assumes GoTrue keeps one account per lowercased email and honours `per_page`;
 * neither is read from GoTrue's source. A failure of any kind throws `gotrue_lookup_failed`.
 * @returns {Promise<{ account: { id: string, emailConfirmed: boolean } | null, complete: boolean }>}
 */
export async function findAccountByEmail({ config, fetchImpl }, address, { perPage = LOOKUP_PER_PAGE } = {}) {
	if (!config.baasUrl || !config.serviceKey) throw lookupFailed(null);
	const wanted = String(address ?? '').trim().toLowerCase();
	let upstream;
	try {
		upstream = await fetchImpl(`${config.baasUrl}/auth/v1/admin/users?filter=${encodeURIComponent(wanted)}&per_page=${perPage}`, {
			headers: gotrueAdminHeaders(config),
			signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
		});
	} catch {
		throw lookupFailed(null);
	}
	if (!upstream?.ok) throw lookupFailed(upstream?.status ?? null);
	let payload;
	try {
		payload = await upstream.json();
	} catch {
		throw lookupFailed(upstream.status);
	}
	const users = Array.isArray(payload) ? payload : Array.isArray(payload?.users) ? payload.users : [];
	const match = users.find((user) => String(user?.email ?? '').trim().toLowerCase() === wanted);
	const account = match ? { id: String(match.id ?? ''), emailConfirmed: typeof match.email_confirmed_at === 'string' && match.email_confirmed_at !== '' } : null;
	return { account, complete: users.length < perPage };
}

const signoutFailed = (upstreamStatus) => Object.assign(new Error('The account directory could not end the sessions.'), { status: 503, code: 'gotrue_signout_failed', upstreamStatus });

async function isMissingUser(upstream) {
	try {
		const payload = await upstream.json();
		return [payload?.error_code, payload?.code].includes('user_not_found');
	} catch {
		return false;
	}
}

/**
 * Ends EVERY GoTrue session of one user (`/auth/v1/logout?scope=global`). GoTrue has no admin
 * route for it (measured 2026-10-25: 404), so the call is made as the user with a 60 s token
 * signed by JWT_SECRET. After it the old refresh token answers 400 and the old access token's
 * getUser answers 403 `session_not_found`, which closes the website's re-mint of a bridge session.
 *
 * Global scope also signs the CALLER out of the website: the osionos tab stays signed in because
 * its bridge session is kept, but the website asks for a new sign-in. The token carries role
 * `authenticated` and is sent only to `/auth/v1/logout`; it is never logged or put on an error.
 *
 * Caveat: the call can take up to 8 s inside make-primary's 60 s kv lock. A 403 `user_not_found`
 * counts as success (no sessions exist); any other failure is one 503 `gotrue_signout_failed`
 * that carries only `upstreamStatus`.
 * @param {{ config: object, fetchImpl: Function, env: object }} deps
 */
export async function endGotrueSessions({ config, fetchImpl, env }, userId) {
	const secret = String(env?.JWT_SECRET ?? '').trim();
	if (!UUID_REGEX.test(String(userId)) || !config.baasUrl || !config.serviceKey || !secret) throw signoutFailed(null);
	const iat = Math.floor(Date.now() / 1000);
	const token = signRealtimeJwt({ sub: userId.toLowerCase(), role: 'authenticated', aud: 'authenticated', iat, exp: iat + 60 }, secret);
	let upstream;
	try {
		upstream = await fetchImpl(`${config.baasUrl}/auth/v1/logout?scope=global`, {
			method: 'POST',
			headers: { apikey: config.serviceKey, Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		throw signoutFailed(null);
	}
	if (upstream.ok) return;
	if (upstream.status === 403 && (await isMissingUser(upstream))) return;
	throw signoutFailed(upstream.status);
}
