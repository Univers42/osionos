/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-member-attributes.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Admin routes for one member attribute of a workspace member:
 *   GET    /api/workspaces/:ws/members/:userId/attributes
 *   PUT    /api/workspaces/:ws/members/:userId/attributes/:name   { value }
 *   DELETE /api/workspaces/:ws/members/:userId/attributes/:name
 *
 * Only an owner or admin writes; a member may read their own. The target must be a live
 * member of the workspace. Every write invalidates the access-generation stamp, because an
 * attribute change can narrow (or widen) what a share rule grants.
 */

import {
	bearerToken,
	fetchWorkspace,
	httpError,
	readJsonBody,
	requireUuid,
	requireWorkspaceAdmin,
	rest,
	sendJson,
	workspaceMembership,
} from './bridge-social-core.mjs';
import { bumpAccessAfter } from './bridge-access-generation.mjs';

const ATTR_TABLE = 'osionos_member_attributes';
const NAME_RE = /^[a-z][a-z0-9_]{0,31}$/;

function valueError(message) {
	return httpError(message, 400);
}

function validateName(name) {
	if (!NAME_RE.test(name)) throw httpError('attribute name must match ^[a-z][a-z0-9_]{0,31}$', 400);
	return name;
}

function validateValue(value) {
	const text = value == null ? '' : String(value);
	if (text.length < 1) throw valueError('value is required');
	if (text.length > 64) throw valueError('value is too long');
	if (text.includes(':')) throw valueError('value must not contain ":"');
	if (text.startsWith(' ') || text.endsWith(' ')) throw valueError('value must not have leading or trailing spaces');
	if (/[\x00-\x1f\x7f]/.test(text)) throw valueError('value must not contain control characters');
	return text;
}

async function readAttributes(config, fetchImpl, workspaceId, userId) {
	const rows = await rest(
		config,
		fetchImpl,
		`${ATTR_TABLE}?workspace_id=eq.${workspaceId}&user_id=eq.${userId}&select=name,value&order=name.asc`,
	);
	return Array.isArray(rows) ? rows.map((row) => ({ name: String(row.name), value: String(row.value) })) : [];
}

async function isMember(config, fetchImpl, workspaceId, userId) {
	const row = await workspaceMembership(config, fetchImpl, userId, workspaceId);
	return Boolean(row);
}

async function handleGet(deps, session, workspaceId, targetId, response, config) {
	const isSelf = String(targetId).toLowerCase() === String(session.userId).toLowerCase();
	if (!isSelf) await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
	if (!(await isMember(config, deps.fetchImpl, workspaceId, targetId))) throw httpError('Member not found.', 404);
	const attributes = await readAttributes(config, deps.fetchImpl, workspaceId, targetId);
	return sendJson(response, 200, { attributes, items: attributes }, config);
}

async function handlePut(deps, session, request, workspaceId, targetId, name, response, config) {
	await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
	if (!(await isMember(config, deps.fetchImpl, workspaceId, targetId))) throw httpError('Member not found.', 404);
	const attrName = validateName(name);
	const body = await readJsonBody(request);
	const value = validateValue(body?.value);
	const now = new Date().toISOString();
	await bumpAccessAfter(rest(config, deps.fetchImpl, `${ATTR_TABLE}?on_conflict=workspace_id,user_id,name`, {
		method: 'POST',
		body: {
			workspace_id: workspaceId,
			user_id: targetId,
			name: attrName,
			value,
			set_by: session.userId,
			updated_at: now,
		},
		prefer: 'resolution=merge-duplicates,return=minimal',
	}), { workspaceId });
	return sendJson(response, 200, { ok: true, attribute: { name: attrName, value } }, config);
}

async function handleDelete(deps, session, workspaceId, targetId, name, response, config) {
	await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
	if (!(await isMember(config, deps.fetchImpl, workspaceId, targetId))) throw httpError('Member not found.', 404);
	const attrName = validateName(name);
	const rows = await bumpAccessAfter(rest(config, deps.fetchImpl, `${ATTR_TABLE}?workspace_id=eq.${workspaceId}&user_id=eq.${targetId}&name=eq.${attrName}`, {
		method: 'DELETE',
		prefer: 'return=representation',
	}), { workspaceId });
	if (!Array.isArray(rows) || rows.length === 0) throw httpError('Attribute not found.', 404);
	return sendJson(response, 200, { ok: true, removed: true, name: attrName }, config);
}

export function createMemberAttributesHandler({ config, verifySession, fetchImpl = fetch }) {
	const deps = { fetchImpl };
	const UUID = '([0-9a-f-]{36})';
	const nameRe = '([a-z][a-z0-9_]{0,31})';
	const collection = new RegExp(`^/api/workspaces/${UUID}/members/${UUID}/attributes$`, 'i');
	const one = new RegExp(`^/api/workspaces/${UUID}/members/${UUID}/attributes/${nameRe}$`, 'i');
	return async function handleMemberAttributesRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		const coll = collection.exec(pathname);
		const single = one.exec(pathname);
		if (!coll && !single) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (coll) {
				if (method === 'GET') {
					return await handleGet(deps, session, requireUuid(coll[1], 'workspaceId'), requireUuid(coll[2], 'userId'), response, requestConfig);
				}
				return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
			}
			if (single) {
				if (method === 'PUT') {
					return await handlePut(deps, session, request, requireUuid(single[1], 'workspaceId'), requireUuid(single[2], 'userId'), single[3], response, requestConfig);
				}
				if (method === 'DELETE') {
					return await handleDelete(deps, session, requireUuid(single[1], 'workspaceId'), requireUuid(single[2], 'userId'), single[3], response, requestConfig);
				}
				return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
			}
			return false;
		} catch (error) {
			return sendJson(response, error?.status ?? 500, {
				ok: false,
				...(error?.code ? { code: error.code } : {}),
				message: error instanceof Error ? error.message : 'Member attribute request failed.',
			}, requestConfig);
		}
	};
}

export const createWorkspaceMemberAttributesHandler = createMemberAttributesHandler;
export const createAttributesHandler = createMemberAttributesHandler;
