/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-settings.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
	UUID_REGEX,
	bearerToken,
	readJsonBody,
	requireUuid,
	safeText,
	sendJson,
} from './bridge-social-core.mjs';
import { bumpAccessAfter } from './bridge-access-generation.mjs';

const ALLOWED_KEYS = new Set(['name', 'icon', 'landingPageId', 'sidebar', 'analytics']);
const SIDEBAR_KEYS = new Set(['newSidebar', 'showApps']);
const ANALYTICS_KEYS = new Set(['pageViews']);
const DEFAULT_ICON = '\ud83c\udf0f';

function fail(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

// Reads go through the injected pg client (the account mount carries no fetchImpl), with
// the same osionos_workspace_members query as bridge-social-core's workspaceMembership.
async function loadCaller(pg, userId, workspaceId) {
	const service = pg.asService();
	const workspaces = await service.get(`osionos_workspaces?id=eq.${workspaceId}&select=id,owner_id,name,settings,visibility&limit=1`);
	const workspace = Array.isArray(workspaces) ? workspaces[0] ?? null : null;
	if (!workspace) throw fail(404, 'workspace_not_found', 'Workspace not found.');
	if (String(workspace.owner_id).toLowerCase() === String(userId).toLowerCase()) return { workspace, canWrite: true };
	const rows = await service.get(`osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${userId}&select=role&limit=1`);
	const membership = Array.isArray(rows) ? rows[0] : null;
	if (!membership) throw fail(404, 'workspace_not_found', 'Workspace not found.');
	return { workspace, canWrite: String(membership.role ?? '').toLowerCase() === 'admin' };
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSettings(settings, name, visibility) {
	const source = isObject(settings) ? settings : {};
	const icon = typeof source.icon === 'string' ? source.icon : DEFAULT_ICON;
	let landingPageId = null;
	if (typeof source.landingPageId === 'string' && UUID_REGEX.test(source.landingPageId)) landingPageId = source.landingPageId;
	const sidebarRaw = isObject(source.sidebar) ? source.sidebar : {};
	const sidebar = {
		newSidebar: typeof sidebarRaw.newSidebar === 'boolean' ? sidebarRaw.newSidebar : true,
		showApps: typeof sidebarRaw.showApps === 'boolean' ? sidebarRaw.showApps : true,
	};
	const analyticsRaw = isObject(source.analytics) ? source.analytics : {};
	const analytics = {
		pageViews: typeof analyticsRaw.pageViews === 'boolean' ? analyticsRaw.pageViews : true,
	};
	return { name, icon, landingPageId, sidebar, analytics, visibility };
}

async function handleGet(deps, session, workspaceId, response) {
	const { workspace } = await loadCaller(deps.pg, session.userId, workspaceId);
	return sendJson(response, 200, normalizeSettings(workspace.settings, workspace.name ?? 'Workspace', workspace.visibility ?? 'confidential'), deps.config);
}

async function validateBody(payload) {
	if (!isObject(payload)) throw fail(422, 'invalid_body', 'The settings body must be a JSON object.');
	for (const key of Object.keys(payload)) {
		if (!ALLOWED_KEYS.has(key)) throw fail(422, 'field_not_editable', `${key} is not an editable field.`);
	}
	const patch = {};
	if (Object.hasOwn(payload, 'name')) {
		if (typeof payload.name !== 'string') throw fail(422, 'invalid_field', 'name must be a string.');
		const name = safeText(payload.name, 120).trim();
		if (!name || name.length > 65) throw fail(422, 'invalid_field', 'name must be between 1 and 65 characters.');
		patch.name = name;
	}
	if (Object.hasOwn(payload, 'icon')) {
		const value = payload.icon;
		if (value === null) patch.icon = null;
		else if (typeof value === 'string' && value.length <= 16) patch.icon = value;
		else throw fail(422, 'invalid_field', 'icon must be a string of at most 16 characters or null.');
	}
	if (Object.hasOwn(payload, 'landingPageId')) {
		const value = payload.landingPageId;
		if (value === null) patch.landingPageId = null;
		else if (typeof value === 'string' && UUID_REGEX.test(value)) patch.landingPageId = value;
		else throw fail(422, 'invalid_field', 'landingPageId must be a UUID or null.');
	}
	if (Object.hasOwn(payload, 'sidebar')) {
		const value = payload.sidebar;
		if (value === null) patch.sidebar = null;
		else if (isObject(value)) {
			for (const key of Object.keys(value)) if (!SIDEBAR_KEYS.has(key)) throw fail(422, 'field_not_editable', `${key} is not an editable field.`);
			const sub = {};
			if (Object.hasOwn(value, 'newSidebar')) {
				if (typeof value.newSidebar !== 'boolean') throw fail(422, 'invalid_field', 'newSidebar must be a boolean.');
				sub.newSidebar = value.newSidebar;
			}
			if (Object.hasOwn(value, 'showApps')) {
				if (typeof value.showApps !== 'boolean') throw fail(422, 'invalid_field', 'showApps must be a boolean.');
				sub.showApps = value.showApps;
			}
			patch.sidebar = sub;
		} else throw fail(422, 'invalid_field', 'sidebar must be an object or null.');
	}
	if (Object.hasOwn(payload, 'analytics')) {
		const value = payload.analytics;
		if (value === null) patch.analytics = null;
		else if (isObject(value)) {
			for (const key of Object.keys(value)) if (!ANALYTICS_KEYS.has(key)) throw fail(422, 'field_not_editable', `${key} is not an editable field.`);
			const sub = {};
			if (Object.hasOwn(value, 'pageViews')) {
				if (typeof value.pageViews !== 'boolean') throw fail(422, 'invalid_field', 'pageViews must be a boolean.');
				sub.pageViews = value.pageViews;
			}
			patch.analytics = sub;
		} else throw fail(422, 'invalid_field', 'analytics must be an object or null.');
	}
	return patch;
}

async function handlePatch(deps, session, workspaceId, request, response) {
	const { workspace, canWrite } = await loadCaller(deps.pg, session.userId, workspaceId);
	if (!canWrite) throw fail(403, 'forbidden', 'Only the workspace owner or an admin may do this.');
	const payload = await readJsonBody(request);
	const patch = await validateBody(payload);

	const currentSettings = isObject(workspace.settings) ? { ...workspace.settings } : {};
	const nextSettings = { ...currentSettings };
	if (Object.hasOwn(patch, 'icon')) {
		if (patch.icon === null) delete nextSettings.icon; else nextSettings.icon = patch.icon;
	}
	if (Object.hasOwn(patch, 'landingPageId')) {
		if (patch.landingPageId === null) delete nextSettings.landingPageId; else nextSettings.landingPageId = patch.landingPageId;
	}
	if (Object.hasOwn(patch, 'sidebar')) {
		if (patch.sidebar === null) delete nextSettings.sidebar;
		else nextSettings.sidebar = { ...(isObject(currentSettings.sidebar) ? currentSettings.sidebar : {}), ...patch.sidebar };
	}
	if (Object.hasOwn(patch, 'analytics')) {
		if (patch.analytics === null) delete nextSettings.analytics;
		else nextSettings.analytics = { ...(isObject(currentSettings.analytics) ? currentSettings.analytics : {}), ...patch.analytics };
	}

	const dbPatch = { settings: nextSettings, updated_at: new Date().toISOString() };
	if (Object.hasOwn(patch, 'name')) dbPatch.name = patch.name;

	await bumpAccessAfter(deps.pg.asService().patch(`osionos_workspaces?id=eq.${workspaceId}`, dbPatch, { prefer: 'return=minimal' }), { workspaceId });

	const mergedName = Object.hasOwn(patch, 'name') ? patch.name : (workspace.name ?? 'Workspace');
	const visibility = workspace.visibility ?? 'confidential';
	return sendJson(response, 200, normalizeSettings(nextSettings, mergedName, visibility), deps.config);
}

export function createWorkspaceSettingsRoutes({ config, pg, verifySession }) {
	const deps = { config, pg };
	return async function handleWorkspaceSettings(url, request, response) {
		const pathname = url.pathname;
		const match = /^\/api\/workspaces\/([0-9a-f-]{36})\/settings$/i.exec(pathname);
		if (!match) return false;
		const method = (request.method || 'GET').toUpperCase();
		const workspaceId = requireUuid(match[1], 'workspaceId');
		try {
			const session = verifySession(bearerToken(request), config);
			if (method === 'GET') return await handleGet(deps, session, workspaceId, response);
			if (method === 'PATCH') return await handlePatch(deps, session, workspaceId, request, response);
			throw fail(405, 'method_not_allowed', `Method ${method} is not supported here.`);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, {
				ok: false,
				...(error?.code ? { code: error.code } : {}),
				message: error instanceof Error ? error.message : 'Workspace settings request failed.',
			}, config);
		}
	};
}
