/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-friendship.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Friendship gate for workspace invites (F1). Friendship = a manual accepted
 * connection in either direction, and no block in either direction.
 *
 * Caveat: a connection withdrawn AFTER the member joined does not remove the
 * membership (by design: C604 re-checks only until accept).
 */

import { rest } from './bridge-social-core.mjs';
import { assertNotBlocked } from './bridge-moderation-core.mjs';

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ''));

export function inviteRequiresConnection(env = process.env) {
	return env?.OSIONOS_INVITE_REQUIRES_CONNECTION === '1';
}

/**
 * The connection verdict between two accounts: 'friends' only for a
 * status=accepted AND source=manual edge in either direction AND no
 * osionos_user_blocks row in either direction.
 *
 * A block read that fails is re-thrown (503 block_check_unavailable, a network
 * error): an unavailable block list is never read as "not blocked".
 */
export async function connectionStatus(config, fetchImpl, a, b) {
	const left = String(a ?? '').toLowerCase();
	const right = String(b ?? '').toLowerCase();
	if (!isUuid(left) || !isUuid(right)) return 'none';
	if (left === right) return 'friends';
	try {
		await assertNotBlocked(config, fetchImpl, a, b, 'blocked');
	} catch (error) {
		if (error?.status === 403) return 'blocked';
		throw error;
	}
	// One pair_key read per gated call: the sorted pair is the table's unique pair.
	const pair = [left, right].sort((x, y) => x.localeCompare(y)).join(':');
	const rows = await rest(
		config,
		fetchImpl,
		`osionos_connections?pair_key=eq.${encodeURIComponent(pair)}&select=requester_id,addressee_id,status,source&limit=1`,
	);
	const edge = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
	if (!edge) return 'none';
	if (String(edge.status).toLowerCase() !== 'accepted') return 'none';
	if (String(edge.source).toLowerCase() !== 'manual') return 'none';
	return 'friends';
}
