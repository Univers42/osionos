/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-library-views.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The workspace's Library views, curated by its owner and admins for every member.
 *
 *   GET /api/workspaces/:id/library-views   any member → { views, updatedAt, canCurate }
 *   PUT /api/workspaces/:id/library-views   owner or admin, body { views, baseUpdatedAt }
 *
 * Stored at osionos_workspaces.settings.library = { views, updatedAt }. `baseUpdatedAt` is
 * the Library's own stamp the editor last saw: a PUT on an older one is 409 with the
 * current views, so two admins never overwrite each other unseen. Who may curate is
 * loadCaller's rule, the same as the settings panel; a stranger gets the same 404.
 * Views are layout, not access data, so the PUT does not bump the access generation.
 */

import { bearerToken, requireUuid, sendJson } from './bridge-social-core.mjs';
import { clientMetaOf, readBody } from './bridge-account-sudo.mjs';
import { rateLimit, writeAudit } from './bridge-guard.mjs';
import { loadCaller } from './bridge-workspace-settings.mjs';
import { writeWorkspaceSettings } from './bridge-workspace-settings-write.mjs';
import { LibraryViewsShapeError, MAX_BYTES, parseLibraryViews, readStoredLibraryViews } from './bridge-library-views-shape.mjs';

const ROUTE = /^\/api\/workspaces\/([0-9a-f-]{36})\/library-views$/i;
const PUT_LIMIT = { limit: 30, windowMs: 60_000 };

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (status, code, message, extra = {}) => Object.assign(new Error(message), { status, code, extra });

function storedLibrary(settings) {
	const library = isObject(settings) && isObject(settings.library) ? settings.library : {};
	return { views: readStoredLibraryViews(library.views), updatedAt: typeof library.updatedAt === 'string' ? library.updatedAt : null };
}

function nextStamp(previous) {
	const before = Date.parse(previous ?? '');
	return new Date(Number.isNaN(before) ? Date.now() : Math.max(Date.now(), before + 1)).toISOString();
}

async function handleGet(deps, session, workspaceId, response) {
	const { workspace, canWrite } = await loadCaller(deps.pg, session.userId, workspaceId);
	return sendJson(response, 200, { ...storedLibrary(workspace.settings), canCurate: canWrite }, deps.config);
}

function readPut(payload) {
	if (!isObject(payload)) throw fail(422, 'invalid_body', 'The body must be a JSON object.');
	const { baseUpdatedAt } = payload;
	if (baseUpdatedAt !== null && (typeof baseUpdatedAt !== 'string' || baseUpdatedAt.length > 64)) {
		throw fail(422, 'invalid_field', 'baseUpdatedAt must be the updatedAt you last read, or null.');
	}
	try {
		return { views: parseLibraryViews(payload.views), baseUpdatedAt };
	} catch (error) {
		if (error instanceof LibraryViewsShapeError) throw fail(422, 'invalid_view', error.message, { path: error.path });
		throw error;
	}
}

async function handlePut(deps, session, workspaceId, request, response) {
	const { canWrite } = await loadCaller(deps.pg, session.userId, workspaceId);
	if (!canWrite) throw fail(403, 'forbidden', 'Only the workspace owner or an admin may change the Library views.');
	await rateLimit(deps.kv, ['library-views', session.userId, workspaceId], PUT_LIMIT);
	const { views, baseUpdatedAt } = readPut(await readBody(request, MAX_BYTES + 1024));
	// Counts only: a view name or filter value is the workspace's content, not an audit fact.
	await writeAudit(deps.pg, {
		session, meta: clientMetaOf(request, deps.config), eventType: 'workspace.library_views_saved',
		details: { workspaceId, viewCount: Object.keys(views).length, bytes: Buffer.byteLength(JSON.stringify(views), 'utf8') },
	});
	const written = await writeWorkspaceSettings(deps.pg.asService(), workspaceId, (current) => {
		const stored = storedLibrary(current);
		if (stored.updatedAt !== baseUpdatedAt) {
			throw fail(409, 'library_views_conflict', 'Someone else changed the Library views; here are theirs.', stored);
		}
		return { ...current, library: { views, updatedAt: nextStamp(stored.updatedAt) } };
	});
	return sendJson(response, 200, { ...storedLibrary(written.settings), canCurate: true }, deps.config);
}

function reply(response, error, config) {
	const status = Number.isInteger(error?.status) ? error.status : 500;
	if (Number.isFinite(error?.retryAfterSeconds)) response.setHeader('retry-after', String(error.retryAfterSeconds));
	return sendJson(response, status, {
		ok: false,
		...(typeof error?.code === 'string' ? { code: error.code } : {}),
		message: error instanceof Error && status < 500 ? error.message : 'The Library views request failed.',
		...(isObject(error?.extra) ? error.extra : {}),
	}, config);
}

export function createLibraryViewsRoutes({ config, pg, kv, verifySession }) {
	const deps = { config, pg, kv };
	return async function handleLibraryViews(url, request, response) {
		const match = ROUTE.exec(url.pathname);
		if (!match) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const workspaceId = requireUuid(match[1], 'workspaceId');
			const session = verifySession(bearerToken(request), config);
			if (method === 'GET') return await handleGet(deps, session, workspaceId, response);
			if (method === 'PUT') return await handlePut(deps, session, workspaceId, request, response);
			throw fail(405, 'method_not_allowed', `Method ${method} is not supported here.`);
		} catch (error) {
			return reply(response, error, config);
		}
	};
}
