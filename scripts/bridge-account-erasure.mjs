/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-erasure.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The deletion executor: once the 14-day grace of a request is over it ends the user's
 * sessions, bans them, erases their rows through ONE SQL function (run twice), deletes
 * the stored objects the erase recorded, and finally deletes the GoTrue user. It has no
 * route: only a timer starts it, and only when two independent switches are set.
 *
 *   off      OSIONOS_ACCOUNT_DELETION_EXECUTOR is not "1", or the account plane is not configured.
 *   dry      OSIONOS_ACCOUNT_DELETION_DRY_RUN=1: reads `_due` and `_plan` only, writes nothing.
 *   refused  NODE_ENV=production without DRY_RUN and without OSIONOS_ACCOUNT_DELETION_VERDICT.
 *   live     everything else.
 *
 * Order per user (steps 0-3 for the whole batch, one wait, then steps 4-7):
 *   0 re-read the request (gone: stop, no side effect)   4 erase again after the wait
 *   1 audit account.deletion_executing (fail-closed)      5 delete recorded objects, then their rows
 *   2 session cutoff, GoTrue ban, PAT revoke             6 delete the GoTrue user (cascades the request)
 *   3 erase (no_deletion_request: unban and stop)         7 audit account.deleted (best effort)
 * Every step is idempotent and the request row survives until step 6, so a crash after any
 * step is finished by the next run. `attempts` is incremented by the SQL claim only.
 *
 * Caveat: the GoTrue ban / unban / delete call shapes (PUT with ban_duration, DELETE on
 * /auth/v1/admin/users/<id>) are NOT proved against a real GoTrue; the fake encodes the
 * assumed shape. A wrong shape fails closed (`ban_failed`, `auth_delete_failed`): no erase
 * runs after a failed ban. Caveat: the 70 s wait outlasts the session poll
 * (STALE_AFTER_MS 60 s) but not a derived credential (account JWT 120 s, IDE token 15 min):
 * a write by one of those after the second erase survives until the user is deleted.
 * Caveat: the 30 minute lease is a clock; a batch takes no new user after 20 minutes.
 */

import { createHash } from 'node:crypto';
import { writeAudit } from './bridge-guard.mjs';
import { revokeAllPats } from './bridge-pat-store.mjs';
import { writeSessionCutoff } from './bridge-session-cutoff.mjs';
import { storageDelete } from './bridge-storage-core.mjs';

export const CLAIM_BATCH = 5;
export const BATCH_WAIT_MS = 70_000;
export const TAKE_NO_MORE_MS = 20 * 60_000;
export const RUN_INTERVAL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
const BAN_DURATION = '876000h';
// A verdict id, not any truthy string: "0" or "false" must not lift the production guard.
const VERDICT_PATTERN = /^D-P5-6/;
const UNBAN_PENDING_KEY = 'erasure:unban_pending';
const UNBAN_PENDING_TTL_MS = 30 * 24 * 60 * 60_000;
const REQUESTS = 'osionos_account_deletion_requests';
const OBJECTS = 'osionos_account_erasure_objects';

const defaultLog = { info: (...args) => console.info(...args), warn: (...args) => console.warn(...args) };
const defaultSleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Which mode the environment selects; `missing` names variables, never values. */
export function executorMode(env, config) {
	if (env.OSIONOS_ACCOUNT_DELETION_EXECUTOR !== '1') return { mode: 'off' };
	if (!config?.baasUrl || !config?.serviceKey) return { mode: 'off' };
	if (env.OSIONOS_ACCOUNT_DELETION_DRY_RUN === '1') return { mode: 'dry' };
	if (env.NODE_ENV === 'production' && !VERDICT_PATTERN.test(env.OSIONOS_ACCOUNT_DELETION_VERDICT ?? '')) {
		return { mode: 'refused', missing: ['OSIONOS_ACCOUNT_DELETION_DRY_RUN', 'OSIONOS_ACCOUNT_DELETION_VERDICT'] };
	}
	return { mode: 'live' };
}

const failure = (code) => Object.assign(new Error(code), { erasureCode: code });
const hashedId = (userId) => createHash('sha256').update(userId).digest('hex').slice(0, 8);
const mentions = (error, text) => String(error?.upstreamText ?? error?.message ?? '').includes(text);

export function createAccountErasureRunner({ config, pg, kv = null, fetchImpl = fetch, env = process.env, sleep = defaultSleep, now = Date.now, log = defaultLog }) {
	const { mode, missing } = executorMode(env, config);
	let running = false;
	let timer = null;
	const adminUrl = (userId) => `${config.baasUrl}/auth/v1/admin/users/${userId}`;

	async function goTrue(method, userId, body) {
		const response = await fetchImpl(adminUrl(userId), {
			method,
			headers: { 'Content-Type': 'application/json', apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
			body: body ? JSON.stringify(body) : undefined,
			signal: AbortSignal.timeout(15_000),
		});
		return response;
	}

	async function guarded(code, action) {
		try {
			return await action();
		} catch (error) {
			throw Object.assign(failure(code), { cause: error });
		}
	}

	// A 2xx alone proves nothing: GoTrue ignores fields it does not know, so a wrong
	// shape answers 200 and bans nobody. The effect is read back from `banned_until`.
	async function banUser(userId, banDuration) {
		const response = await goTrue('PUT', userId, { ban_duration: banDuration });
		if (!response.ok) throw new Error(`gotrue ${response.status}`);
		const body = await response.json().catch(() => null);
		const until = body?.banned_until;
		if (banDuration === 'none' ? until !== null : !(Date.parse(until) > now())) throw new Error('gotrue ban not in effect');
	}

	async function requestStillThere(userId) {
		try {
			return await requestExists(userId);
		} catch {
			return true;
		}
	}

	async function readUnbanPending() {
		try {
			const parsed = JSON.parse((await kv?.get(UNBAN_PENDING_KEY)) ?? '[]');
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	async function writeUnbanPending(list) {
		try {
			await kv?.set(UNBAN_PENDING_KEY, JSON.stringify(list), UNBAN_PENDING_TTL_MS);
		} catch {
			log.warn('account_deletion_unban_pending_unwritable');
		}
	}

	/** The user is banned and their request is gone: lift the ban, or remember to. */
	async function releaseBan(userId) {
		log.warn('banned_without_request', hashedId(userId));
		try {
			await banUser(userId, 'none');
		} catch {
			await writeUnbanPending([...new Set([...(await readUnbanPending()), userId])]);
		}
	}

	// Caveat: the pending list is one read-modify-write key, so two replicas can drop an
	// entry; it survives a restart only on a Redis-backed store (in-memory loses it).
	async function retryUnbans() {
		const pending = await readUnbanPending();
		if (pending.length === 0) return;
		const left = [];
		for (const userId of pending) {
			if (await requestStillThere(userId)) continue;
			try {
				await banUser(userId, 'none');
			} catch {
				left.push(userId);
			}
		}
		await writeUnbanPending(left);
		if (left.length > 0) log.warn('banned_without_request', `${left.length} pending`);
	}

	async function requestExists(userId) {
		const rows = await pg.asService().get(`${REQUESTS}?user_id=eq.${userId}&select=user_id&limit=1`);
		return Array.isArray(rows) && rows.length > 0;
	}

	/** Steps 0-3. Returns null when the user was stopped without failing. */
	async function prepare(userId) {
		const exists = await guarded('request_read_failed', () => requestExists(userId));
		if (!exists) {
			log.info('account_deletion_cancelled', hashedId(userId));
			return null;
		}
		await guarded('audit_unavailable', () => writeAudit(pg, { session: { userId }, meta: {}, eventType: 'account.deletion_executing', details: {} }));
		await guarded('cutoff_failed', () => writeSessionCutoff(config, fetchImpl, userId, now()));
		await guarded('ban_failed', () => banUser(userId, BAN_DURATION));
		await guarded('pat_revoke_failed', () => revokeAllPats({ pg, userId, now: now() }));
		try {
			return await pg.asService().rpc('osionos_account_erase', { p_user: userId });
		} catch (error) {
			const cancelled = mentions(error, 'no_deletion_request');
			if (!cancelled && await requestStillThere(userId)) throw Object.assign(failure('erase_failed'), { cause: error });
			await releaseBan(userId);
			log.info('account_deletion_cancelled_after_ban', hashedId(userId));
			return null;
		}
	}

	async function deleteObjects(userId) {
		const rows = await pg.asService().get(`${OBJECTS}?user_id=eq.${userId}&select=bucket,key`);
		for (const row of Array.isArray(rows) ? rows : []) {
			await storageDelete(userId, row.key, fetchImpl, env, row.bucket);
		}
		await pg.asService().del(`${OBJECTS}?user_id=eq.${userId}`, { prefer: 'return=minimal' });
	}

	async function deleteAuthUser(userId) {
		const response = await goTrue('DELETE', userId);
		if (response.ok) return;
		// Only GoTrue's own 404 means "already gone"; Kong's "no Route matched" is a wrong path.
		const body = response.status === 404 ? await response.json().catch(() => null) : null;
		if (body?.error_code !== 'user_not_found') throw new Error(`gotrue ${response.status}`);
	}

	/** Steps 4-7. */
	async function finish(userId, firstResult) {
		const result = await guarded('erase_failed', () => pg.asService().rpc('osionos_account_erase', { p_user: userId }));
		await guarded('object_delete_failed', () => deleteObjects(userId));
		await guarded('auth_delete_failed', () => deleteAuthUser(userId));
		const outcome = result ?? firstResult;
		try {
			await writeAudit(pg, {
				session: { userId },
				meta: {},
				eventType: 'account.deleted',
				details: { counts: outcome?.counts ?? {}, dispositions: outcome?.dispositions ?? {}, successor: outcome?.successor ?? 'none' },
			});
		} catch {
			log.warn('account_deleted_audit_lost', hashedId(userId));
		}
	}

	async function recordFailure(userId, error) {
		const code = error?.erasureCode ?? 'unknown_failure';
		log.warn('account_deletion_step_failed', hashedId(userId), code);
		try {
			await pg.asService().patch(`${REQUESTS}?user_id=eq.${userId}`, { last_error: code }, { prefer: 'return=minimal' });
		} catch {
			log.warn('account_deletion_last_error_lost', hashedId(userId));
		}
	}

	async function warnStuck() {
		try {
			const rows = await pg.asService().get(`${REQUESTS}?attempts=gte.${MAX_ATTEMPTS}&select=user_id`);
			if (Array.isArray(rows) && rows.length > 0) log.warn('account_deletion_stuck', rows.length);
		} catch {
			log.warn('account_deletion_stuck_unreadable');
		}
	}

	async function dryRun() {
		const due = await pg.asService().rpc('osionos_account_deletion_due', { p_limit: CLAIM_BATCH });
		for (const row of Array.isArray(due) ? due : []) {
			const plan = await pg.asService().rpc('osionos_account_erase_plan', { p_user: row.user_id });
			log.info('account_deletion_dry_run', hashedId(row.user_id), JSON.stringify(plan));
		}
		return Array.isArray(due) ? due.length : 0;
	}

	async function liveRun() {
		await retryUnbans();
		const claimedAt = now();
		const claimed = await pg.asService().rpc('osionos_account_deletion_claim', { p_limit: CLAIM_BATCH });
		const prepared = [];
		for (const row of Array.isArray(claimed) ? claimed : []) {
			if (now() - claimedAt > TAKE_NO_MORE_MS) break;
			try {
				const result = await prepare(row.user_id);
				if (result) prepared.push({ userId: row.user_id, result });
			} catch (error) {
				await recordFailure(row.user_id, error);
			}
		}
		if (prepared.length > 0) await sleep(BATCH_WAIT_MS);
		for (const { userId, result } of prepared) {
			try {
				await finish(userId, result);
			} catch (error) {
				await recordFailure(userId, error);
			}
		}
		await warnStuck();
		return prepared.length;
	}

	/** One pass; a second call while one runs is a no-op. */
	async function runOnce() {
		if (running || (mode !== 'dry' && mode !== 'live')) return 0;
		running = true;
		try {
			return mode === 'dry' ? await dryRun() : await liveRun();
		} catch {
			log.warn('account_deletion_run_failed');
			return 0;
		} finally {
			running = false;
		}
	}

	function start() {
		if (mode === 'refused') log.warn('account_deletion_executor_refused_missing', missing.join(','));
		if (timer || (mode !== 'dry' && mode !== 'live')) return;
		timer = setInterval(runOnce, RUN_INTERVAL_MS);
		if (timer.unref) timer.unref();
	}

	function stop() {
		if (timer) clearInterval(timer);
		timer = null;
	}

	return { mode, start, stop, runOnce };
}
