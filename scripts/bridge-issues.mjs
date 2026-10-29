/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-issues.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { requireAdmin } from './bridge-admin-check.mjs';
import { inFilter } from './bridge-paging.mjs';
import { redactIssueText } from './bridge-issue-redact.mjs';
import {
	UUID_REGEX,
	bearerToken,
	httpError,
	readJsonBody,
	rest,
	safeText,
	sendJson,
	workspaceMembership,
} from './bridge-social-core.mjs';

const ISSUE_TABLE = 'osionos_issue_reports';
const PROFILE_TABLE = 'osionos_profiles';
const ROUTE_KINDS = new Set(['page', 'database', 'chat', 'settings', 'admin', 'other']);
const STATUSES = new Set(['open', 'triaged', 'sent', 'closed']);
const GITHUB_URL_RE = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/[0-9]+$/;
const SCREENSHOT_RE = /^\/api\/media\/uploads\/([^/]+)\/([0-9a-fA-F]{64})\.(png|jpe?g|webp)$/;
const MAX_BODY_BYTES = 32 * 1024;
const TITLE_MAX = 120;
const BODY_MAX = 4000;
const ERROR_MAX = 500;
// The table's CHECKs: no control character in a title or a short field, and only
// the newline in a body. A pasted stack trace brings tabs and CRLF, so those are
// normalised first instead of refused.
const ANY_CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROL_BUT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const normaliseText = (text) => text.replace(/\r\n?/g, '\n').replace(/\t/g, '  ');

const allowedPostKeys = new Set([
	'title', 'body', 'routeKind', 'appVersion', 'userAgent', 'errors',
	'screenshotPath', 'workspaceId',
]);

function messageOf(error) {
	return error instanceof Error ? error.message : 'unknown error';
}

function sqlStateOf(error) {
	return /"code"\s*:\s*"(\w{5})"/.exec(String(error?.message ?? ''))?.[1] ?? '';
}

function parsePostBody(body, callerId) {
	const source = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
	if (!source) throw httpError('Request body must be JSON.', 400);
	for (const key of Object.keys(source)) {
		if (!allowedPostKeys.has(key)) throw httpError('Unknown field.', 400);
	}
	if (typeof source.title !== 'string') throw httpError('title must be a string.', 400);
	const title = normaliseText(source.title);
	if (title.length < 1 || title.length > TITLE_MAX) throw httpError('title must be 1..120 chars.', 400);
	if (ANY_CONTROL.test(title)) throw httpError('title has control chars.', 400);
	if (typeof source.body !== 'string') throw httpError('body must be a string.', 400);
	const text = normaliseText(source.body);
	if (text.length < 1 || text.length > BODY_MAX) throw httpError('body must be 1..4000 chars.', 400);
	if (CONTROL_BUT_NEWLINE.test(text)) throw httpError('body has control chars.', 400);
	if (typeof source.routeKind !== 'string') throw httpError('routeKind must be a string.', 400);
	const routeKind = source.routeKind;
	if (!ROUTE_KINDS.has(routeKind)) throw httpError('routeKind is invalid.', 400);
	let appVersion = null;
	if (source.appVersion !== undefined && source.appVersion !== null) {
		if (typeof source.appVersion !== 'string') throw httpError('appVersion must be a string.', 400);
		if (source.appVersion.length > 64) throw httpError('appVersion too long.', 400);
		if (ANY_CONTROL.test(source.appVersion)) throw httpError('appVersion has control chars.', 400);
		appVersion = source.appVersion;
		if (appVersion === '') appVersion = null;
	}
	let userAgent = null;
	if (source.userAgent !== undefined && source.userAgent !== null) {
		if (typeof source.userAgent !== 'string') throw httpError('userAgent must be a string.', 400);
		if (source.userAgent.length > 300) throw httpError('userAgent too long.', 400);
		if (ANY_CONTROL.test(source.userAgent)) throw httpError('userAgent has control chars.', 400);
		userAgent = source.userAgent;
		if (userAgent === '') userAgent = null;
	}
	let errors = [];
	if (source.errors !== undefined && source.errors !== null) {
		if (!Array.isArray(source.errors)) throw httpError('errors must be an array.', 400);
		if (source.errors.length > 20) throw httpError('too many errors.', 400);
		for (const entry of source.errors) {
			if (typeof entry !== 'string') throw httpError('errors entries must be strings.', 400);
			if (entry.length > ERROR_MAX) throw httpError('error entry too long.', 400);
			errors.push(entry);
		}
	}
	let screenshotPath = null;
	if (source.screenshotPath !== undefined && source.screenshotPath !== null) {
		if (typeof source.screenshotPath !== 'string') throw httpError('screenshotPath must be a string.', 400);
		const match = SCREENSHOT_RE.exec(source.screenshotPath);
		if (!match) throw httpError('screenshotPath is invalid.', 400);
		const uuidSegment = match[1];
		if (!UUID_REGEX.test(uuidSegment)) throw httpError('screenshotPath is invalid.', 400);
		if (uuidSegment.toLowerCase() !== String(callerId).toLowerCase()) throw httpError('screenshotPath is invalid.', 400);
		screenshotPath = source.screenshotPath;
	}
	let workspaceId = null;
	if (source.workspaceId !== undefined && source.workspaceId !== null) {
		if (typeof source.workspaceId !== 'string' || !UUID_REGEX.test(source.workspaceId)) throw httpError('workspaceId must be a UUID.', 400);
		workspaceId = source.workspaceId;
	}
	return {
		title, body: text, routeKind, appVersion, userAgent, errors, screenshotPath, workspaceId,
	};
}

export function createIssuesHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleIssuesRoute(url, request, response, requestConfig = config) {
		if (url.pathname !== '/api/issues' && !/^\/api\/issues\/[^/]+$/.test(url.pathname)) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (url.pathname === '/api/issues') {
				if (method === 'POST') {
					let body;
					try {
						body = await readJsonBody(request, MAX_BODY_BYTES);
					} catch (error) {
						const status = Number(error?.status) === 413 ? 413 : 400;
						return sendJson(response, status, { ok: false, code: 'invalid_request' }, requestConfig);
					}
					const parsed = parsePostBody(body, session.userId);
					// workspace membership (live): drop if not a member.
					let workspaceId = parsed.workspaceId;
					if (workspaceId) {
						const member = await workspaceMembership(requestConfig, deps.fetchImpl, session.userId, workspaceId);
						if (!member) workspaceId = null;
					}
					// A redaction can lengthen a short secret ("Bearer x" → "Bearer [redacted]"):
					// cut again so the row still fits the table's limits.
					const redactedTitle = redactIssueText(parsed.title).slice(0, TITLE_MAX);
					const redactedBody = redactIssueText(parsed.body).slice(0, BODY_MAX);
					const redactedErrors = parsed.errors.map((entry) => redactIssueText(entry).slice(0, ERROR_MAX));
					try {
						const rows = await rest(requestConfig, deps.fetchImpl, 'rpc/osionos_issue_report_create', {
							method: 'POST',
							body: {
								p_reporter: session.userId,
								p_workspace: workspaceId,
								p_title: redactedTitle,
								p_body: redactedBody,
								p_route_kind: parsed.routeKind,
								p_app_version: parsed.appVersion,
								p_user_agent: parsed.userAgent,
								p_errors: redactedErrors,
								p_screenshot_path: parsed.screenshotPath,
							},
						});
						const row = Array.isArray(rows) ? rows[0] ?? null : rows;
						if (row && typeof row === 'object') delete row.reporter_id;
						return sendJson(response, 201, { ok: true, issue: row }, requestConfig);
					} catch (error) {
						const state = sqlStateOf(error);
						if (state === 'P0001' || String(error?.message ?? '').includes('issue_report_daily_cap')) {
							return sendJson(response, 429, { code: 'issue_report_daily_cap' }, requestConfig);
						}
						console.warn(`[osionos-bridge] issue report create failed: ${messageOf(error)}`);
						return sendJson(response, 502, { ok: false, code: 'issue_report_failed' }, requestConfig);
					}
				}
				if (method === 'GET') {
					const scope = safeText(url.searchParams.get('scope') ?? 'mine', 8) || 'mine';
					if (scope !== 'mine' && scope !== 'all') throw httpError('invalid scope.', 400);
					if (scope === 'all') {
						await requireAdmin(deps, requestConfig, session);
					}
					const statusFilter = url.searchParams.get('status');
					if (statusFilter !== null && statusFilter !== '' && !STATUSES.has(statusFilter)) throw httpError('invalid status.', 400);
					const limitParam = url.searchParams.get('limit');
					const limitRaw = limitParam ? Math.trunc(Number(limitParam)) : 50;
					const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;
					const before = url.searchParams.get('before');
					let beforeIso = null;
					if (before) {
						const ms = Date.parse(before);
						if (Number.isNaN(ms)) throw httpError('invalid before.', 400);
						beforeIso = new Date(ms).toISOString();
					}
					const filters = [];
					if (scope === 'mine') filters.push(`reporter_id=eq.${session.userId}`);
					if (statusFilter) filters.push(`status=eq.${statusFilter}`);
					if (beforeIso) filters.push(`created_at=lt.${encodeURIComponent(beforeIso)}`);
					let path = `${ISSUE_TABLE}?`;
					if (filters.length > 0) path += filters.join('&') + '&';
					path += `select=*&order=created_at.desc&limit=${limit}`;
					const rows = await rest(requestConfig, deps.fetchImpl, path);
					const list = Array.isArray(rows) ? rows : [];
					if (scope === 'all') {
						const ids = [...new Set(list.map((row) => row.reporter_id).filter(Boolean))];
						let nameMap = new Map();
						if (ids.length > 0) {
							const profiles = await rest(requestConfig, deps.fetchImpl, `${PROFILE_TABLE}?${inFilter('user_id', ids)}&select=user_id,display_name`);
							nameMap = new Map((Array.isArray(profiles) ? profiles : []).map((p) => [p.user_id, p.display_name ?? null]));
						}
						const withNames = list.map((row) => ({ ...row, reporterName: nameMap.has(row.reporter_id) ? (nameMap.get(row.reporter_id) ?? null) : null }));
						return sendJson(response, 200, { ok: true, issues: withNames }, requestConfig);
					}
					return sendJson(response, 200, { ok: true, issues: list }, requestConfig);
				}
				return sendJson(response, 405, { ok: false, code: 'method_not_allowed', message: `Method ${method} is not supported here.` }, requestConfig);
			}
			// PATCH /api/issues/:id
			if (method === 'PATCH') {
				await requireAdmin(deps, requestConfig, session);
				const id = decodeURIComponent(url.pathname.slice('/api/issues/'.length));
				if (!UUID_REGEX.test(id)) throw httpError('Not found.', 404);
				let body;
				try {
					body = await readJsonBody(request, MAX_BODY_BYTES);
				} catch (error) {
					const status = Number(error?.status) === 413 ? 413 : 400;
					return sendJson(response, status, { ok: false, code: 'invalid_request' }, requestConfig);
				}
				const allowedPatchKeys = new Set(['status', 'githubUrl']);
				for (const key of Object.keys(body && typeof body === 'object' && !Array.isArray(body) ? body : {})) {
					if (!allowedPatchKeys.has(key)) throw httpError('Unknown field.', 400);
				}
				const src = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
				if (!src || (src.status === undefined && src.githubUrl === undefined)) throw httpError('Nothing to update.', 400);
				const patch = { updated_at: new Date().toISOString() };
				if (src.status !== undefined) {
					if (typeof src.status !== 'string' || !STATUSES.has(src.status)) throw httpError('invalid status.', 400);
					patch.status = src.status;
				}
				if (src.githubUrl !== undefined) {
					if (typeof src.githubUrl !== 'string' || !GITHUB_URL_RE.test(src.githubUrl)) throw httpError('invalid githubUrl.', 400);
					patch.github_url = src.githubUrl;
				}
				const rows = await rest(requestConfig, deps.fetchImpl, `${ISSUE_TABLE}?id=eq.${id}`, {
					method: 'PATCH',
					body: patch,
					prefer: 'return=representation',
				});
				const updated = Array.isArray(rows) ? rows[0] ?? null : rows;
				if (!updated) throw httpError('Not found.', 404);
				if (typeof updated === 'object' && updated !== null) delete updated.reporter_id;
				return sendJson(response, 200, { ok: true, issue: updated }, requestConfig);
			}
			return sendJson(response, 405, { ok: false, code: 'method_not_allowed', message: `Method ${method} is not supported here.` }, requestConfig);
		} catch (error) {
			const status = error?.status ?? 500;
			const code = error?.code ?? 'invalid_request';
			const message = error instanceof Error ? error.message : 'The issues route failed.';
			return sendJson(response, status, { ok: false, code, message }, requestConfig);
		}
	};
}
