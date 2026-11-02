/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-machines-store.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The osionos_machines rows (own-machines-plan.md, API contract, "Table"), in the PAT model
// (bridge-pat-store.mjs): the list reads through the account role, so the owner policy is the
// scope and a filter mistake here cannot widen it; every write and every read that needs the
// pubkey goes through the service role, with the owner taken from the verified session.
//
// readMachine is deliberately uncached: the token mint and the heartbeat read revoked_at from
// Postgres on every call (condition 7).
import { pgError } from './bridge-pg.mjs';

const TABLE = 'osionos_machines';
const LIST_COLUMNS = 'id,name,platform,fingerprint,is_default,created_at';
const READ_COLUMNS = 'id,user_id,pubkey,revoked_at';
export const MACHINE_CAP = 5;

/** A missing table is an outage, never an empty answer. */
function unavailable(error) {
	if (Number(error?.upstreamStatus) === 404) return pgError(503, 'account_plane_unavailable');
	return error;
}

async function guarded(work) {
	try {
		return await work();
	} catch (error) {
		throw unavailable(error);
	}
}

const live = (params) => new URLSearchParams({ revoked_at: 'is.null', ...params });

export function countLiveMachines({ pg, userId }) {
	const params = live({ user_id: `eq.${userId}`, select: 'id', limit: String(MACHINE_CAP + 1) });
	return guarded(async () => {
		const rows = await pg.asService().get(`${TABLE}?${params}`);
		return Array.isArray(rows) ? rows.length : 0;
	});
}

export function insertMachine({ pg, row }) {
	return guarded(() => pg.asService().post(TABLE, row, { prefer: 'return=minimal' }));
}

export function listMachines({ pg, session }) {
	const params = live({ select: LIST_COLUMNS, order: 'created_at.asc', limit: String(MACHINE_CAP) });
	return guarded(async () => {
		const rows = await pg.asUser(session).get(`${TABLE}?${params}`);
		return Array.isArray(rows) ? rows : [];
	});
}

/** The row an id names, revoked or not, whoever owns it: the caller decides what it may see. */
export function readMachine({ pg, id }) {
	const params = new URLSearchParams({ id: `eq.${id}`, select: READ_COLUMNS });
	return guarded(async () => {
		const rows = await pg.asService().get(`${TABLE}?${params}`);
		return Array.isArray(rows) ? (rows[0] ?? null) : null;
	});
}

/** The caller's live row with that id, or null: another user's row and a revoked one look the same. */
export async function readOwnedMachine({ pg, id, userId }) {
	const row = await readMachine({ pg, id });
	return row && row.user_id === userId && row.revoked_at == null ? row : null;
}

const patch = (pg, params, body) => guarded(async () => {
	const rows = await pg.asService().patch(`${TABLE}?${params}`, body, { prefer: 'return=representation' });
	return Array.isArray(rows) ? rows : [];
});

// Caveat: two PATCHes, not one transaction. Between them the user has no default for a moment,
// and a failure of the second leaves none; the partial unique index (one true per user) is
// what makes the order matter, so the clear always comes first.
export async function setDefaultMachine({ pg, userId, id }) {
	await patch(pg, new URLSearchParams({ user_id: `eq.${userId}`, is_default: 'eq.true', select: 'id' }), { is_default: false });
	const rows = await patch(pg, live({ id: `eq.${id}`, user_id: `eq.${userId}`, select: 'id' }), { is_default: true });
	return rows.length > 0;
}

export async function revokeMachine({ pg, userId, id, now }) {
	const rows = await patch(pg, live({ id: `eq.${id}`, user_id: `eq.${userId}`, select: 'id' }), { revoked_at: new Date(now).toISOString(), is_default: false });
	return rows.length > 0;
}
