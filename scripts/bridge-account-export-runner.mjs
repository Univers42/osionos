/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-export-runner.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The worker side of the account data export: it claims one queued job, reads the
 * owner's rows table by table from the registry (osionos_account_data_map), builds
 * the artifact, stores it with ONE put and only then marks the job done. A failure
 * at any step marks it failed with a stable code; a partial result is never done.
 * A second sweep deletes the object of every job past its expiry and marks it expired.
 *
 * Caveat: a job claimed by a process that then dies stays running until the database
 * lease (30 minutes) lets another process claim it again; the artifact is built in
 * memory, so the peak is about twice the byte cap for one job at a time per process;
 * the 15 s storage timeout is the practical ceiling for an artifact upload; rows are
 * read page by page without a snapshot, so a row written during the read may or may
 * not be in the archive; the caps are unmeasured defaults.
 */

import { ensureBucket, storageDelete, storagePut } from './bridge-storage-core.mjs';
import { UUID_REGEX } from './bridge-social-core.mjs';
import { COLUMNS as EMAIL_COLUMNS, emailExportTable } from './bridge-account-email-rows.mjs';
import { EXPORT_MAX_BYTES, EXPORT_MAX_ROWS, buildArtifact, planTables } from './bridge-account-export-archive.mjs';

export const EXPORT_BUCKET = 'account-exports';
export const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EXPORT_KEY_FOR = (job) => `${job.id}.${job.format}`;
const PAGE_SIZE = 500;
const TICK_MS = 30_000;
const SWEEP_LIMIT = 50;
const KNOWN_CODES = /^(export_[a-z_]+|zip_[a-z_]+)$/;

function failureCode(error) {
	if (typeof error?.code === 'string' && KNOWN_CODES.test(error.code)) return error.code;
	return error?.status === 502 ? 'export_storage_failed' : 'export_failed';
}

function scopeFilter(plan, userId) {
	if (plan.scope.length === 1) return `${plan.scope[0]}=eq.${userId}`;
	return `or=(${plan.scope.map((column) => `${column}.eq.${userId}`).join(',')})`;
}

/** The path of one page: keyset on id when id is exported, else offset over every column. */
function pagePath(plan, userId, cursor, offset) {
	const base = `${plan.table}?select=${plan.columns.join(',')}&${scopeFilter(plan, userId)}&limit=${PAGE_SIZE}${plan.filter ? `&${plan.filter}` : ''}`;
	if (plan.columns.includes('id')) return `${base}&order=id.asc${cursor === null ? '' : `&id=gt.${encodeURIComponent(cursor)}`}`;
	return `${base}&order=${plan.columns.map((column) => `${column}.asc`).join(',')}&offset=${offset}`;
}

/** Every row of the owner in one table; throws export_too_large the moment a cap is crossed. */
async function readTable(db, plan, userId, budget) {
	const rows = [];
	let cursor = null;
	for (;;) {
		const page = await db.get(pagePath(plan, userId, cursor, rows.length));
		// Ends on an EMPTY page: a server-side row cap below PAGE_SIZE returns short pages mid-table.
		if (!Array.isArray(page) || page.length === 0) break;
		for (const row of page) {
			budget.rows += 1;
			budget.bytes += JSON.stringify(row).length;
			if (budget.rows > EXPORT_MAX_ROWS || budget.bytes > EXPORT_MAX_BYTES) {
				throw Object.assign(new Error('The export is over the size cap.'), { status: 413, code: 'export_too_large' });
			}
			rows.push(row);
		}
		cursor = plan.columns.includes('id') ? String(page.at(-1).id) : null;
	}
	return { name: plan.table, columns: plan.columns, rows };
}

const EMAIL_PLAN = { table: 'osionos_user_emails', columns: EMAIL_COLUMNS.split(','), scope: ['user_id'], filter: null };

/** The raw address rows; a database without the table (404 / PGRST205) has none to export. */
async function readEmailRows(db, userId, budget) {
	try {
		return (await readTable(db, EMAIL_PLAN, userId, budget)).rows;
	} catch (error) {
		if (error?.upstreamStatus !== 404 && error?.upstreamCode !== 'PGRST205') throw error;
		console.warn(`[osionos-bridge] account export: the addresses table is missing (status ${error.upstreamStatus ?? 'none'})`);
		return [];
	}
}

async function buildJobArtifact(db, job, env, now) {
	if (!UUID_REGEX.test(String(job.user_id))) throw Object.assign(new Error('The job has no valid owner.'), { code: 'export_bad_owner' });
	const registry = await db.get('osionos_account_data_map?export_columns=not.is.null&select=table_name,column_name,role,export_columns&limit=1000');
	const budget = { rows: 0, bytes: 0 };
	const tables = [];
	const plans = planTables(registry);
	// The registry must never become a second door to the sealed table.
	if (plans.some((plan) => plan.table === EMAIL_PLAN.table)) throw Object.assign(new Error('The registry may not export the addresses table.'), { code: 'export_forbidden_column' });
	for (const plan of plans) tables.push(await readTable(db, plan, job.user_id, budget));
	tables.push(emailExportTable(await readEmailRows(db, job.user_id, budget), env));
	tables.sort((left, right) => left.name.localeCompare(right.name));
	return buildArtifact(job.format, tables, new Date(now()).toISOString());
}

async function runJob(db, job, { env, fetchImpl, now }) {
	const startedAt = now();
	let stored = false;
	try {
		const artifact = await buildJobArtifact(db, job, env, now);
		await ensureBucket(job.user_id, EXPORT_BUCKET, fetchImpl, env);
		await storagePut(job.user_id, EXPORT_KEY_FOR(job), artifact.contentType, artifact.bytes, fetchImpl, env, EXPORT_BUCKET);
		stored = true;
		await db.patch(`osionos_account_exports?id=eq.${job.id}`, {
			status: 'done',
			bytes: artifact.bytes.length,
			finished_at: new Date(now()).toISOString(),
			expires_at: new Date(now() + EXPORT_TTL_MS).toISOString(),
		}, { prefer: 'return=minimal' });
	} catch (error) {
		// An object with no done row has no expiry and nobody to sweep it.
		if (stored) await storageDelete(job.user_id, EXPORT_KEY_FOR(job), fetchImpl, env, EXPORT_BUCKET).catch((deleteError) => console.warn(`[osionos-bridge] account export object left with no expiry: ${failureCode(deleteError)}`));
		console.warn(`[osionos-bridge] account export failed after ${now() - startedAt} ms: ${failureCode(error)}`);
		await db.patch(`osionos_account_exports?id=eq.${job.id}`, {
			status: 'failed',
			error_code: failureCode(error),
			finished_at: new Date(now()).toISOString(),
		}, { prefer: 'return=minimal' });
	}
}

async function sweepExpired(db, { env, fetchImpl, now }) {
	const cutoff = encodeURIComponent(new Date(now()).toISOString());
	const due = await db.get(`osionos_account_exports?status=eq.done&expires_at=lt.${cutoff}&select=id,user_id,format&limit=${SWEEP_LIMIT}`);
	for (const job of Array.isArray(due) ? due : []) {
		await storageDelete(job.user_id, EXPORT_KEY_FOR(job), fetchImpl, env, EXPORT_BUCKET);
		await db.patch(`osionos_account_exports?id=eq.${job.id}`, { status: 'expired' }, { prefer: 'return=minimal' });
	}
}

/** The runner: `tick()` claims and runs at most one job, then sweeps; `start()` ticks on an unref'd timer. */
export function createExportRunner({ pg, env = process.env, fetchImpl = fetch, now = Date.now }) {
	const context = { env, fetchImpl, now };
	let busy = false;
	let timer = null;
	async function tick() {
		if (busy) return false;
		busy = true;
		try {
			const db = pg.asService();
			const claimed = await db.rpc('osionos_account_export_claim', {});
			const job = Array.isArray(claimed) ? claimed[0] : claimed;
			if (job?.id) await runJob(db, job, context);
			await sweepExpired(db, context);
			return Boolean(job?.id);
		} catch (error) {
			console.warn(`[osionos-bridge] account export tick skipped: ${error instanceof Error ? error.message : 'failed'}`);
			return false;
		} finally {
			busy = false;
		}
	}
	return {
		tick,
		start() {
			if (timer) return;
			timer = setInterval(tick, TICK_MS);
			timer.unref();
		},
		stop() {
			if (timer) clearInterval(timer);
			timer = null;
		},
	};
}
