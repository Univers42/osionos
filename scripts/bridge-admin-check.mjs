/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-admin-check.mjs                             :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE ADMIN GATE — the one place where "is this caller an administrator?" is
 * answered, for every admin route of the bridge.
 *
 * C91 — the session's `isAdmin` claim is a HINT: it is read at sign-in and lives
 *       up to an hour, so a demoted admin keeps it. The answer is therefore read
 *       TWICE, and in THIS order:
 *
 *   1. the CLAIM first — a caller whose token does not claim the right never
 *      reaches the database at all: not one row is read for a call that cannot
 *      be allowed.
 *   2. the ROW second — `osionos_bridge_identities.is_admin` is re-read on every
 *      call, because the claim outlives a demotion.
 *
 * A read that FAILS is a 503 (`admin_check_failed`): a broken read is not a
 * permission. Anything but `is_admin === true` is a 403 (`admin_required`).
 *
 * The moderation console and the recs health share this gate: the rule is
 * written once, and the console's own answers do not change.
 */

import { rest } from './bridge-social-core.mjs';

/** An error the admin gate answers itself: a status and a code the client reads. */
const adminError = (message, status, code) => Object.assign(new Error(message), { status, code });

/**
 * C91: the caller must be an administrator, and the DATABASE decides. The claim
 * is checked FIRST (no row is read without it), then the row itself.
 *
 * deps: { fetchImpl, env? } — the same deps the handlers carry.
 */
export async function requireAdmin(deps, config, session) {
	// The claim first: without it the database is never touched.
	if (session?.isAdmin !== true) throw adminError('Administrator access required.', 403, 'admin_required');
	let rows;
	try {
		rows = await rest(config, deps.fetchImpl, `osionos_bridge_identities?user_id=eq.${session.userId}&select=is_admin&limit=1`);
	} catch {
		throw adminError('The administrator flag could not be read.', 503, 'admin_check_failed');
	}
	const row = Array.isArray(rows) ? rows[0] : null;
	if (row?.is_admin !== true) throw adminError('Administrator access required.', 403, 'admin_required');
}
