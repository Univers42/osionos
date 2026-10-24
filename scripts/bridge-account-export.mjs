/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-export.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The routes of the account data export: ask for an export (sudo, three a day), list
 * and read the caller's jobs, download a finished one. The job is a row the runner
 * (bridge-account-export-runner.mjs) works through; nothing here builds an archive.
 *
 * Every read of a job goes through the caller's own database role, so another user's
 * job is invisible to it; an id that is not the caller's answers exactly like an id
 * that does not exist. The object key is derived from the id and never sent.
 *
 * Caveat: a download holds the whole object in memory for the response (at most the
 * byte cap), so many large downloads at once cost that much each; the daily limit is
 * counted when the request is made, so a request refused later (409) still uses one.
 */

import { rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { UUID_REGEX, sendJson } from './bridge-social-core.mjs';
import { storageGet } from './bridge-storage-core.mjs';
import { accountError, callerSession, clientMetaOf, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { zipAvailable } from './bridge-zip.mjs';
import { EXPORT_MAX_BYTES } from './bridge-account-export-archive.mjs';
import { EXPORT_BUCKET, EXPORT_KEY_FOR, createExportRunner } from './bridge-account-export-runner.mjs';

const EXPORT_PATH = '/api/account/export';
const JOB_PATH = /^\/api\/account\/export\/([^/]+)(\/download)?$/;
const FORMATS = ['json', 'csv', 'zip'];
const DAILY_LIMIT = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 10;
const JOB_COLUMNS = 'id,format,status,requested_at,finished_at,expires_at,bytes,error_code';
const PLANE_DOWN = 'The account plane is unavailable; try again shortly.';
const DOWNLOAD_TYPES = { json: 'application/json', csv: 'text/csv; charset=utf-8', zip: 'application/zip' };

/** The job as the client sees it: no owner, no object key. */
function publicJob(row) {
	return {
		id: row.id,
		format: row.format,
		status: row.status,
		requestedAt: row.requested_at ?? null,
		finishedAt: row.finished_at ?? null,
		expiresAt: row.expires_at ?? null,
		bytes: row.bytes ?? null,
		errorCode: row.error_code ?? null,
	};
}

async function listJobs(pg, session, id) {
	const params = new URLSearchParams({ user_id: `eq.${session.userId}`, select: JOB_COLUMNS, order: 'requested_at.desc', limit: String(LIST_LIMIT) });
	if (id) params.set('id', `eq.${id}`);
	try {
		const rows = await pg.asUser(session).get(`osionos_account_exports?${params}`);
		return Array.isArray(rows) ? rows : [];
	} catch {
		throw accountError(503, 'account_plane_unavailable', PLANE_DOWN);
	}
}

async function readOwnJob(pg, session, rawId) {
	const notFound = accountError(404, 'export_not_found', 'This export does not exist.');
	if (!UUID_REGEX.test(rawId)) throw notFound;
	const [row] = await listJobs(pg, session, rawId.toLowerCase());
	if (!row) throw notFound;
	return row;
}

function readFormat(body) {
	const format = body?.format === undefined ? 'zip' : body.format;
	if (!FORMATS.includes(format)) throw accountError(422, 'invalid_format', 'The export format must be json, csv or zip.');
	if (format === 'zip' && !zipAvailable) throw accountError(503, 'export_unavailable', 'Zip exports are unavailable on this server.');
	return format;
}

async function requestExport({ pg, kv, config }, session, request, response) {
	await requireSudo(kv, session);
	await rateLimit(kv, ['account-export', session.userId], { limit: DAILY_LIMIT, windowMs: DAY_MS });
	const format = readFormat(await readBody(request));
	await writeAudit(pg, { session, meta: clientMetaOf(request, config), eventType: 'account.export_requested', details: { format } });
	try {
		const rows = await pg.asUser(session).post('osionos_account_exports', { user_id: session.userId, format }, { prefer: 'return=representation' });
		sendJson(response, 202, { id: rows?.[0]?.id ?? null, status: 'queued' }, config);
		config.activity?.emit(session, 'export', 'settings', null);
		return true;
	} catch (error) {
		if (String(error?.upstreamCode) !== '23505') throw accountError(503, 'account_plane_unavailable', PLANE_DOWN);
	}
	const open = (await listJobs(pg, session)).find((row) => row.status === 'queued' || row.status === 'running');
	return sendJson(response, 409, {
		ok: false,
		code: 'export_in_progress',
		message: 'An export is already in progress for this account.',
		id: open?.id ?? null,
	}, config);
}

function assertDownloadable(row, now) {
	const expired = row.status === 'expired' || (row.expires_at && Date.parse(row.expires_at) <= now);
	if (expired) throw accountError(410, 'export_expired', 'This export has expired; request a new one.');
	if (row.status !== 'done') throw accountError(409, 'export_not_ready', 'This export is not ready yet.');
	if (!Number.isFinite(row.bytes) || row.bytes > EXPORT_MAX_BYTES) throw accountError(413, 'export_too_large', 'This export is too large to download.');
}

async function download({ pg, config, env, fetchImpl, now }, session, rawId, request, response) {
	const row = await readOwnJob(pg, session, rawId);
	assertDownloadable(row, now());
	await writeAudit(pg, { session, meta: clientMetaOf(request, config), eventType: 'account.export_downloaded', details: { format: row.format } });
	const object = await storageGet(session.userId, EXPORT_KEY_FOR(row), fetchImpl, env, EXPORT_BUCKET);
	if (object.status === 404) throw accountError(410, 'export_expired', 'This export is no longer available; request a new one.');
	if (!object.buffer) throw accountError(502, 'export_storage_failed', 'The export could not be read; try again shortly.');
	response.writeHead(200, {
		'content-type': DOWNLOAD_TYPES[row.format],
		'content-length': object.buffer.length,
		'content-disposition': `attachment; filename="osionos-export.${row.format}"`,
		'cache-control': 'private, no-store',
		'x-content-type-options': 'nosniff',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end(object.buffer);
	return true;
}

function methodNotAllowed(method) {
	return accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
}

/**
 * The export routes. `runner: false` leaves the worker off (tests drive `tick` themselves);
 * the handler carries the runner as `.runner` so the host can stop it.
 */
export function createAccountExportRoutes({ config, pg, kv, verifySession, env = process.env, fetchImpl = fetch, now = Date.now, runner = true }) {
	const context = { pg, kv, config, env, fetchImpl, now };
	const worker = createExportRunner({ pg, env, fetchImpl, now });
	if (runner) worker.start();
	async function handleAccountExport(url, request, response) {
		const match = JOB_PATH.exec(url.pathname);
		if (url.pathname !== EXPORT_PATH && !match) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = callerSession(request, config, verifySession);
			if (!match) {
				if (method === 'POST') return await requestExport(context, session, request, response);
				if (method !== 'GET') throw methodNotAllowed(method);
				const rows = await listJobs(pg, session);
				return sendJson(response, 200, { exports: rows.map(publicJob) }, config);
			}
			if (method !== 'GET') throw methodNotAllowed(method);
			if (match[2]) return await download(context, session, match[1], request, response);
			return sendJson(response, 200, publicJob(await readOwnJob(pg, session, match[1])), config);
		} catch (error) {
			return respondWithError(response, error, config);
		}
	}
	handleAccountExport.runner = worker;
	return handleAccountExport;
}
