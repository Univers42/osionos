/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-access-request-decisions.mjs            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The owner side of page access requests: listing the caller's pending requests, and
 * approving or declining one. Split out of bridge-page-access-requests.mjs so neither
 * module crosses the 300-line ceiling.
 */

import { httpError, identitySummaries, readJsonBody, safeText, sendJson } from './bridge-social-core.mjs';
import { connectionStatus } from './bridge-friendship.mjs';
import { writeShareRule } from './bridge-perms.mjs';
import { sameId, ownerHoldsPage } from './bridge-page-read.mjs';
import {
	REQUEST_WINDOW_MS,
	decidePending,
	insertNotification,
	memberRow,
	ownerMemberRow,
	ownerPages,
	pageRow,
	pendingForPages,
	requestRow,
	restorePending,
} from './bridge-page-access-request-store.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIST = 50;
const APPROVE_PERMISSIONS = new Set(['can_view', 'can_comment', 'can_edit']);
const RULE_RANK = { no_access: 0, can_view: 1, can_comment: 2, can_edit: 3, full_access: 4 };
const BLOCKED = 'blocked';

function logger(log) {
	return (label, error) => log(`[bridge-page-access-requests] ${label}: ${error?.message || error}`);
}

function pageAnswer(row) {
	return {
		id: row.id, pageId: row.page_id, requesterId: row.requester_id,
		note: row.note ?? null, status: row.status, createdAt: row.created_at ?? null,
	};
}

function existingUserRule(rules, pageId, requesterId) {
	return rules.find((rule) => {
		const resourceId = rule?.resourceId ?? rule?.resource_id ?? '';
		return sameId(resourceId, pageId)
			&& rule?.target?.type === 'user' && sameId(rule.target.userId, requesterId);
	}) ?? null;
}

function rulePermission(rule) {
	return rule?.permission ?? null;
}

async function decisionGuards(deps, session, requestId) {
	const { config, fetchImpl } = deps;
	const found = await requestRow(config, fetchImpl, requestId);
	if (!found) throw Object.assign(httpError('Access request not found.', 404), { code: 'request_not_found' });
	const page = await pageRow(config, fetchImpl, found.page_id);
	if (!page || !sameId(page.workspace_id, found.workspace_id)) {
		throw Object.assign(httpError('Access request not found.', 404), { code: 'request_not_found' });
	}
	const owner = await ownerMemberRow(config, fetchImpl, session.userId, page.workspace_id);
	if (!sameId(page.owner_id, session.userId) || !ownerHoldsPage(page, session.userId, owner)) {
		throw Object.assign(httpError('Access request not found.', 404), { code: 'request_not_found' });
	}
	const requester = await memberRow(config, fetchImpl, found.requester_id, page.workspace_id);
	if (!requester) throw Object.assign(httpError('This request is closed.', 409), { code: 'request_closed' });
	let status;
	try {
		status = await connectionStatus(config, fetchImpl, session.userId, found.requester_id);
	} catch (error) {
		throw Object.assign(httpError('The block list could not be read; try again.', 503), { code: 'block_check_unavailable', cause: error });
	}
	if (status === BLOCKED) throw Object.assign(httpError('This request is closed.', 409), { code: 'request_closed' });
	return { found, page, owner };
}

export async function approve(deps, session, request, response, requestId, config) {
	const payload = await readJsonBody(request).catch(() => ({}));
	const permission = String(payload?.permission ?? '');
	if (!APPROVE_PERMISSIONS.has(permission)) {
		return sendJson(response, 422, { ok: false, error: 'invalid_permission', message: 'permission must be can_view|can_comment|can_edit.' }, config);
	}
	const replace = payload?.replace === true;
	const { found, page, owner } = await decisionGuards(deps, session, requestId);
	const rules = await deps.ruleStore.listForPage(config, page.workspace_id, page.id);
	const existing = existingUserRule(rules, page.id, found.requester_id);
	const existingPermission = rulePermission(existing);
	if (existing && !replace && (RULE_RANK[permission] ?? 0) < (RULE_RANK[existingPermission] ?? 99)) {
		return sendJson(response, 409, {
			ok: false, error: 'existing_rule', message: 'A rule already exists for this user.', permission: existingPermission,
		}, config);
	}
	const decidedAt = new Date(deps.now()).toISOString();
	const cutoff = new Date(deps.now() - REQUEST_WINDOW_MS).toISOString();
	const saved = await decidePending(config, deps.fetchImpl, requestId, cutoff, {
		status: 'approved', decided_by: session.userId, decided_at: decidedAt,
	});
	if (!saved) return sendJson(response, 409, { ok: false, error: 'request_closed', message: 'This request is closed.' }, config);
	const ctx = { requestConfig: config, session };
	try {
		await writeShareRule(ctx, {
			workspaceId: page.workspace_id, resourceType: 'page', resourceId: page.id,
			target: { type: 'user', userId: found.requester_id }, permission, explicit: true,
		}, {
			fetchImpl: deps.fetchImpl, ruleStore: deps.ruleStore,
			gate: async () => owner, isMember: async () => Boolean(owner),
		});
	} catch (error) {
		logger(deps.log)('rule write failed; request restored', error);
		await restorePending(config, deps.fetchImpl, requestId).catch((restoreError) => logger(deps.log)('restore failed', restoreError));
		return sendJson(response, 503, { ok: false, error: 'rule_write_failed', message: 'The access rule could not be written.' }, config);
	}
	const entry = await deps.createPageAccessLoader({ userId: found.requester_id }, config, deps.fetchImpl).entryFor(page.workspace_id);
	if (deps.pageLevelFor(entry, page, found.requester_id) === 'none') {
		return sendJson(response, 409, {
			ok: false, error: 'overridden_by_deny', message: 'A deny rule still hides this page from that member.',
		}, config);
	}
	await insertNotification(config, deps.fetchImpl, {
		user_id: found.requester_id, type: 'page_access_decision', actor_id: session.userId,
		channel_id: page.id, preview: 'approved',
	}).catch((error) => logger(deps.log)('decision notice failed', error));
	return sendJson(response, 200, { ok: true, status: 'approved', request: pageAnswer(saved), permission }, config);
}

export async function decline(deps, session, response, requestId, config) {
	const { found } = await decisionGuards(deps, session, requestId);
	const decidedAt = new Date(deps.now()).toISOString();
	const cutoff = new Date(deps.now() - REQUEST_WINDOW_MS).toISOString();
	const saved = await decidePending(config, deps.fetchImpl, requestId, cutoff, {
		status: 'declined', decided_by: session.userId, decided_at: decidedAt,
	});
	if (!saved) return sendJson(response, 409, { ok: false, error: 'request_closed', message: 'This request is closed.' }, config);
	await insertNotification(config, deps.fetchImpl, {
		user_id: found.requester_id, type: 'page_access_decision', actor_id: session.userId,
		channel_id: found.page_id, preview: 'declined',
	}).catch((error) => logger(deps.log)('decision notice failed', error));
	return sendJson(response, 200, { ok: true, status: 'declined', request: pageAnswer(saved) }, config);
}

export async function listRequests(deps, session, url, response, config) {
	const workspaceId = String(url.searchParams.get('workspaceId') ?? '');
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
		return sendJson(response, 400, { ok: false, error: 'access_request_bad_request', message: 'workspaceId must be a UUID.' }, config);
	}
	const member = await memberRow(config, deps.fetchImpl, session.userId, workspaceId);
	const pages = (await ownerPages(config, deps.fetchImpl, session.userId, workspaceId))
		.filter((page) => ownerHoldsPage(page, session.userId, member));
	const pageById = new Map(pages.map((page) => [String(page.id).toLowerCase(), page]));
	const cutoff = new Date(deps.now() - REQUEST_WINDOW_MS).toISOString();
	const rows = pageById.size === 0 ? [] : await pendingForPages(config, deps.fetchImpl, pages.map((page) => page.id), cutoff, MAX_LIST + 1);
	const capped = rows.filter((row) => pageById.has(String(row.page_id).toLowerCase())).slice(0, MAX_LIST);
	const identities = await identitySummaries(config, deps.fetchImpl, capped.map((row) => row.requester_id));
	const rules = await deps.ruleStore.listForWorkspace(config, workspaceId);
	const requests = capped.map((row) => {
		const page = pageById.get(String(row.page_id).toLowerCase());
		const existing = existingUserRule(rules, page.id, row.requester_id);
		return {
			id: row.id, pageId: row.page_id, pageTitle: page.title ?? 'Untitled',
			requesterName: identities.get(row.requester_id)?.name ?? 'Member',
			note: row.note ?? null, createdAt: row.created_at ?? null,
			existingPermission: rulePermission(existing),
		};
	});
	return sendJson(response, 200, { ok: true, requests, truncated: rows.length > MAX_LIST }, config);
}
