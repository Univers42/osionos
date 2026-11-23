/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-admin-demote.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/account/admin/users/:userId/demote (osionos#343): an admin takes the admin away from
 * another admin. The identity flag (`osionos_bridge_identities.is_admin`) is the root of trust
 * (ADR 0005) and every sign-in and refresh turns it back into the admin grant (#296), so the
 * demotion clears the flag itself, then what the flag implied, then the target's live tokens.
 *
 * Gates, in order, each before any audit row or write (ruling D343-2): the users dispatcher's
 * `user_roles` admin and its write throttle, `requireAdmin` (claim and flag: a caller whose admin
 * is only a grant cannot clear a root-of-trust flag), not the caller, sudo, no env-listed address,
 * the global lock, the caller's flag re-read inside it, and at least one other flagged admin.
 *
 * Writes, in this order: the flag on both keys, every admin grant (expired ones too), the
 * admin-workspace membership, the session cut-off. Flag first because the other half-state
 * reverts: with the grant gone and the flag still set, the next sign-in writes the grant back.
 * Nothing is rolled back and the flag is never re-set: a partial run answers 503
 * demote_incomplete with the steps that landed, and a re-run finishes the rest (no short cut on
 * "flag already false"). The 200 waits for a read-back that finds none of the three rows.
 *
 * Caveat: the lock release is a plain `del` (kv has no compare-and-delete): a run that outlives
 * the lock's TTL can delete the lock a later run took, letting a third run in. The caller's flag
 * is re-read right before the clear, which narrows a mutual demotion past the TTL to the one
 * round trip between that read and the clear; it does not close it.
 * Caveat: only the addresses the bridge knows are checked: the GoTrue primary and the verified
 * secondaries. An address added to OSIONOS_ADMIN_EMAILS later still promotes the account at its
 * next verified sign-in, by design (ADR 0005); so does a gateway address that is neither (U4).
 * Caveat: the target is signed out everywhere, not only from its admin sessions: the cut-off is
 * per user, and it is what kills the tokens whose admin claim was minted before the clear.
 * Caveat: the audit row records an attempt; a run that fails after it leaves a row for a
 * demotion that did not complete.
 */

import { bumpAccessAfter } from './bridge-access-generation.mjs';
import { createEmailRows, openAddress } from './bridge-account-email-rows.mjs';
import { requireAdmin } from './bridge-admin-check.mjs';
import { ADMIN_WORKSPACE_ID, flaggedRowsQuery } from './bridge-admin-rights.mjs';
import { BAAS_FETCH_TIMEOUT_MS } from './bridge-baas-body.mjs';
import { readGotrueUser } from './bridge-gotrue-user.mjs';
import { requireSudo, writeAudit } from './bridge-guard.mjs';
import { pgError } from './bridge-pg.mjs';
import { isAdminAddress } from './bridge-roles.mjs';
import { cutOffSessions } from './bridge-session-cutoff.mjs';
import { sessionClock } from './bridge-sessions.mjs';
import { sendJson } from './bridge-social-core.mjs';

const LOCK_KEY = 'admin-demote';
// The locked section is at most ten sequential service-role calls (the read-back's three reads
// are one parallel round), each bounded by the fetch timeout; two more rounds are the margin.
// Caveat: the bound holds only while each call aborts at BAAS_FETCH_TIMEOUT_MS. A paused
// process, a starved event loop or a slow kv adds time it does not count, and that run loses
// the lock midway (the release Caveat in the header, and the re-read before the clear).
const LOCKED_ROUNDS = 10;
const LOCK_TTL_MS = (LOCKED_ROUNDS + 2) * BAAS_FETCH_TIMEOUT_MS;
const MEMBERSHIP = `osionos_workspace_members?workspace_id=eq.${ADMIN_WORKSPACE_ID}`;
const LISTED = 'This account is an admin by an address listed in OSIONOS_ADMIN_EMAILS, and its next sign-in would make it admin again. '
	+ 'Remove the address from OSIONOS_ADMIN_EMAILS first, then demote it.';
const INCOMPLETE = 'The demotion did not complete. Run it again to finish the remaining steps.';

const demoteError = (status, code, message) => Object.assign(new Error(message), { status, code });
const jtiOf = (session) => String(session.raw?.jti ?? '').toLowerCase();

async function primaryAddress(ctx, targetId) {
	try {
		const user = await readGotrueUser({ config: ctx.config, fetchImpl: ctx.fetchImpl }, targetId);
		return user?.email ?? null;
	} catch (error) {
		if (error?.upstreamStatus === 404) throw demoteError(404, 'user_not_found', 'User not found.');
		throw error;
	}
}

/** A verified secondary can be made primary, so it promotes too. One that does not open fails closed. */
async function verifiedSecondaries(ctx, targetId) {
	const unreadable = () => demoteError(503, 'admin_email_unreadable', 'The addresses of this account could not be read; nothing was changed.');
	let rows;
	try {
		rows = await createEmailRows({ pg: ctx.pg, env: ctx.env }).list(targetId);
	} catch {
		throw unreadable();
	}
	return rows.filter((row) => row.verified_at != null).map((row) => {
		const address = openAddress(row, ctx.env);
		if (address === null) throw unreadable();
		return address;
	});
}

/** The sign-in promotes an env-listed address on every sign-in (F2): such a demotion would not hold. */
async function assertNotEnvListed(ctx, targetId) {
	const addresses = [await primaryAddress(ctx, targetId), ...await verifiedSecondaries(ctx, targetId)];
	if (addresses.some((address) => isAdminAddress(ctx.config.adminEmails, address))) throw demoteError(409, 'admin_email_listed', LISTED);
}

/**
 * One lock for every demotion, not one per target: A demoting B while B demotes A passes both
 * gates and both counts, and leaves no flagged admin.
 */
async function withLock(ctx, run) {
	let held;
	try {
		held = await ctx.kv.setNx(LOCK_KEY, jtiOf(ctx.session), LOCK_TTL_MS);
	} catch {
		throw demoteError(503, 'demote_unavailable', 'The demotion could not start; try again shortly.');
	}
	if (!held) throw demoteError(409, 'demote_busy', 'Another admin demotion is running; try again in a moment.');
	try {
		return await run();
	} finally {
		await ctx.kv.del(LOCK_KEY).catch(() => {});
	}
}

/** Distinct user ids, not rows: one person with two flagged identities is one admin. */
async function assertNotLastAdmin(client, targetId) {
	let rows;
	try {
		rows = await client.get('osionos_bridge_identities?is_admin=eq.true&select=user_id');
	} catch {
		throw demoteError(503, 'admin_check_failed', 'The administrator flags could not be read; nothing was changed.');
	}
	const others = new Set((Array.isArray(rows) ? rows : []).map((row) => String(row?.user_id ?? '').toLowerCase()).filter((id) => id !== '' && id !== targetId));
	if (others.size === 0) throw demoteError(409, 'last_admin', 'This is the last administrator; promote another account first.');
}

async function adminRoleId(client) {
	const found = await client.get('roles?name=eq.admin&select=id&limit=1');
	const roleId = Array.isArray(found) ? found[0]?.id : null;
	// The four rows are seeded by grobase's migrations: a missing one is a broken install.
	if (!roleId) throw pgError(503, 'platform_roles_unavailable');
	return roleId;
}

/** The steps after the flag, in order. Each is tried even when an earlier one failed. */
function laterSteps(ctx, targetId, roleId) {
	const { client, config, fetchImpl } = ctx;
	const minimal = { prefer: 'return=minimal' };
	return [
		['grant', () => client.del(`user_roles?user_id=eq.${targetId}&role_id=eq.${roleId}`, minimal)],
		['membership', () => bumpAccessAfter(client.del(`${MEMBERSHIP}&user_id=eq.${targetId}`, minimal), { workspaceId: ADMIN_WORKSPACE_ID, userId: targetId })],
		// The clock is read after the clear returned. +1 ms: a token stamped in that same millisecond
		// may carry claims read before the clear, and the verifier only refuses iat < cut-off.
		// Caveat: a fresh sign-in stamped in that same millisecond is refused too; it signs in again.
		['sessions', () => cutOffSessions(config, fetchImpl, targetId, sessionClock(config) + 1)],
	];
}

async function runSteps(ctx, targetId, roleId) {
	const landed = [];
	try {
		await ctx.client.patch(`osionos_bridge_identities?or=(user_id.eq.${targetId},subject.eq.${targetId})`, { is_admin: false }, { prefer: 'return=minimal' });
	} catch {
		return { landed, complete: false };
	}
	landed.push('flag');
	let complete = true;
	for (const [name, step] of laterSteps(ctx, targetId, roleId)) {
		try {
			await step();
			landed.push(name);
		} catch {
			complete = false;
		}
	}
	return { landed, complete };
}

/** True when any of the three rows is still there, or when the read-back itself failed. */
async function hasLeftovers(client, targetId, roleId) {
	try {
		const found = await Promise.all([
			client.get(flaggedRowsQuery(targetId)),
			client.get(`user_roles?user_id=eq.${targetId}&role_id=eq.${roleId}&select=role_id`),
			client.get(`${MEMBERSHIP}&user_id=eq.${targetId}&select=user_id`),
		]);
		return found.some((rows) => Array.isArray(rows) && rows.length > 0);
	} catch {
		return true;
	}
}

async function demoteLocked(ctx, targetId) {
	const { client, config, session } = ctx;
	// The gate ran before the lock; a concurrent demotion of the caller may have landed since.
	await requireAdmin({ fetchImpl: ctx.fetchImpl }, config, session);
	await assertNotLastAdmin(client, targetId);
	const roleId = await adminRoleId(client);
	await writeAudit(ctx.pg, { session, meta: ctx.meta, eventType: 'admin_role_change', details: { targetUserId: targetId, action: 'demote' } });
	// A run stalled past the lock's TTL lets a second demotion in, which may have demoted the
	// caller since the re-read above: two admins would then clear each other down to zero.
	await requireAdmin({ fetchImpl: ctx.fetchImpl }, config, session);
	const run = await runSteps(ctx, targetId, roleId);
	if (!run.complete) return run;
	return { ...run, complete: !(await hasLeftovers(client, targetId, roleId)) };
}

/**
 * ctx: the users console's { config, pg, kv, session, client } plus `fetchImpl` (GoTrue and the
 * cut-off write), `env` (the address seal keys) and `meta` (the audit row's client columns).
 */
export async function demoteAdmin(ctx, targetId, response) {
	const { config, session } = ctx;
	await requireAdmin({ fetchImpl: ctx.fetchImpl }, config, session);
	if (targetId === session.userId.toLowerCase()) throw demoteError(409, 'self_demotion', 'You cannot demote yourself.');
	await requireSudo(ctx.kv, session);
	await assertNotEnvListed(ctx, targetId);
	const outcome = await withLock(ctx, () => demoteLocked(ctx, targetId));
	if (outcome.complete) return sendJson(response, 200, { ok: true }, config);
	return sendJson(response, 503, { ok: false, code: 'demote_incomplete', message: INCOMPLETE, landed: outcome.landed }, config);
}
