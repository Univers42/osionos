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
