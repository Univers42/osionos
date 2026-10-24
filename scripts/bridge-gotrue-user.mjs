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
