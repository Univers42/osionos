/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-collab.mjs                                   :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Workspace collaboration & join flow for the osionos bridge
 * (`/api/workspaces/:id`, `/api/collaboration*`, `/api/join-requests/:id`) —
 * standalone module in the bridge-rtc style: bridge-api.mjs injects `config` +
 * `verifySession`. Shared plumbing comes from bridge-social-core.mjs; nothing is
 * re-declared.
 *
 * Discovery only surfaces visibility in (request_to_join, public). `confidential`
 * workspaces are invisible — meta and entry-page reads 404. Visibility changes
 * and join-request decisions are OWNER-only (osionos_workspaces.owner_id).
 */

import { createHmac, createHash } from 'node:crypto';
import {
	UUID_REGEX,
	bearerToken,
	httpError,
	identitySummaries,
	publishRealtime,
	readJsonBody,
	requireUuid,
	rest,
	safeText,
	sendJson,
} from './bridge-social-core.mjs';
import { readRawBody } from './bridge-chat-media.mjs';
import { ensureChatBucket, extFromMime, storageObjectKey, storagePut } from './bridge-storage-core.mjs';

const REALTIME_TOKEN_TTL_SECONDS = 3600;
const b64urlJson = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * Mint a short-lived HS256 realtime token the grobase gateway accepts
 * (REALTIME_JWT_SECRET = the shared JWT_SECRET, no audience). `namespaces` is the
 * EXACT topic allow-list the gateway authorizes against (can_subscribe_to: an
 * entry must equal the topic's namespace; an empty list grants nothing), so the
 * token's reach is precisely the namespaces passed in — never a wildcard.
 */
export function mintRealtimeToken({ secret, userId, namespaces, ttlSeconds = REALTIME_TOKEN_TTL_SECONDS, now = Date.now() }) {
	if (!secret) throw httpError('Realtime signing secret (JWT_SECRET) is not configured.', 503);
	const issuedAt = Math.floor(now / 1000);
	const exp = issuedAt + Math.min(Math.max(Number(ttlSeconds) || REALTIME_TOKEN_TTL_SECONDS, 60), 86400);
	const payload = { sub: String(userId), iat: issuedAt, exp, namespaces, can_subscribe: true, can_publish: true };
	const signingInput = `${b64urlJson({ alg: 'HS256', typ: 'JWT' })}.${b64urlJson(payload)}`;
	const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
	return { token: `${signingInput}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
}

const DISCOVERABLE = new Set(['request_to_join', 'public']);
const VISIBILITY_VALUES = new Set(['confidential', 'request_to_join', 'public']);

async function fetchWorkspace(config, fetchImpl, workspaceId) {
	const rows = await rest(config, fetchImpl, `osionos_workspaces?id=eq.${workspaceId}&select=id,owner_id,name,slug,visibility&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function requireOwner(config, fetchImpl, userId, workspaceId) {
	const workspace = await fetchWorkspace(config, fetchImpl, workspaceId);
	if (!workspace) throw httpError('Workspace not found.', 404);
	if (workspace.owner_id !== userId) throw httpError('Only the workspace owner may do this.', 403);
	return workspace;
}

/** PATCH /api/workspaces/:id {name?, visibility?} — owner only. */
async function patchWorkspace(deps, session, request, workspaceId, response, config) {
	await requireOwner(config, deps.fetchImpl, session.userId, workspaceId);
	const payload = await readJsonBody(request);
	const patch = {};
	if (typeof payload.name === 'string') {
		const name = safeText(payload.name, 120).trim();
		if (!name) throw httpError('name cannot be empty.', 422);
		patch.name = name;
	}
	if (payload.visibility !== undefined) {
		const visibility = safeText(payload.visibility, 24);
		if (!VISIBILITY_VALUES.has(visibility)) throw httpError('visibility must be confidential|request_to_join|public.', 422);
		patch.visibility = visibility;
	}
	if (Object.keys(patch).length === 0) throw httpError('Nothing to update.', 422);
	patch.updated_at = new Date().toISOString();
	await rest(config, deps.fetchImpl, `osionos_workspaces?id=eq.${workspaceId}`, {
		method: 'PATCH',
		body: patch,
		prefer: 'return=minimal',
	});
	return sendJson(response, 200, { ok: true, workspaceId, ...patch }, config);
}

/** GET /api/collaboration — discoverable workspaces + memberCount + joinState. */
async function listCollaboration(deps, session, url, response, config) {
	const query = safeText(url.searchParams.get('query'), 80);
	const limitRaw = Number(url.searchParams.get('limit'));
	const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 50) : 30;
	let path = 'osionos_workspaces?visibility=in.(request_to_join,public)&select=id,owner_id,name,slug,visibility&order=name.asc&limit=200';
	if (query) path += `&name=ilike.${encodeURIComponent(`*${query}*`)}`;
	const rows = await rest(config, deps.fetchImpl, path);
	const workspaces = (Array.isArray(rows) ? rows : []).slice(0, limit);
	const ids = workspaces.map((row) => row.id).filter((id) => UUID_REGEX.test(String(id)));
	const memberRows = ids.length ? await rest(config, deps.fetchImpl, `osionos_workspace_members?workspace_id=in.(${ids.join(',')})&select=workspace_id,user_id`) : [];
	const reqRows = ids.length ? await rest(config, deps.fetchImpl, `osionos_join_requests?workspace_id=in.(${ids.join(',')})&requester_id=eq.${session.userId}&status=eq.pending&select=workspace_id`) : [];
	const countByWs = new Map();
	const memberWs = new Set();
	for (const row of Array.isArray(memberRows) ? memberRows : []) {
		countByWs.set(row.workspace_id, (countByWs.get(row.workspace_id) ?? 0) + 1);
		if (row.user_id === session.userId) memberWs.add(row.workspace_id);
	}
	const pendingWs = new Set((Array.isArray(reqRows) ? reqRows : []).map((row) => row.workspace_id));
	const list = workspaces.map((row) => ({
		id: row.id,
		name: row.name ?? 'Workspace',
		slug: row.slug ?? '',
		visibility: row.visibility,
		memberCount: countByWs.get(row.id) ?? 0,
		joinState: memberWs.has(row.id) ? 'member' : (pendingWs.has(row.id) ? 'pending' : 'none'),
	}));
	return sendJson(response, 200, { ok: true, workspaces: list }, config);
}

/** GET /api/collaboration/:id — workspace meta + a single entry page. */
async function getCollaboration(deps, session, workspaceId, response, config) {
	const workspace = await fetchWorkspace(config, deps.fetchImpl, workspaceId);
	if (!workspace || workspace.visibility === 'confidential') throw httpError('Workspace not found.', 404);
	const pageRows = await rest(config, deps.fetchImpl, `osionos_pages?workspace_id=eq.${workspaceId}&visibility=in.(public,shared)&select=id,title,icon,cover,content&order=created_at.asc&limit=1`);
	const page = Array.isArray(pageRows) ? pageRows[0] ?? null : null;
	return sendJson(response, 200, {
		ok: true,
		workspace: { id: workspace.id, name: workspace.name ?? 'Workspace', slug: workspace.slug ?? '', visibility: workspace.visibility, ownerId: workspace.owner_id },
		entryPage: page ? { id: page.id, title: page.title ?? 'Untitled', icon: page.icon ?? null, cover: page.cover ?? null, content: Array.isArray(page.content) ? page.content : [] } : null,
	}, config);
}

async function addMember(config, fetchImpl, workspaceId, userId) {
	await rest(config, fetchImpl, 'osionos_workspace_members?on_conflict=workspace_id,user_id', {
		method: 'POST',
		body: { workspace_id: workspaceId, user_id: userId, role: 'viewer', permissions: ['read'] },
		prefer: 'resolution=ignore-duplicates,return=minimal',
	});
}

/** POST /api/collaboration/:id/join {message?} — public joins, gated requests. */
async function joinCollaboration(deps, session, request, workspaceId, response, config) {
	const workspace = await fetchWorkspace(config, deps.fetchImpl, workspaceId);
	if (!workspace || workspace.visibility === 'confidential') throw httpError('Workspace not found.', 404);
	const payload = await readJsonBody(request);
	if (workspace.visibility === 'public') {
		await addMember(config, deps.fetchImpl, workspaceId, session.userId);
		return sendJson(response, 200, { ok: true, joined: true }, config);
	}
	await rest(config, deps.fetchImpl, 'osionos_join_requests?on_conflict=workspace_id,requester_id', {
		method: 'POST',
		body: { workspace_id: workspaceId, requester_id: session.userId, message: safeText(payload.message, 500) || null },
		prefer: 'resolution=merge-duplicates,return=minimal',
	});
	await publishRealtime({
		topic: `user:${workspace.owner_id}`,
		eventType: 'join_requested',
		payload: { workspaceId, requesterId: session.userId },
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	});
	return sendJson(response, 202, { ok: true, joined: false, requested: true }, config);
}

/** GET /api/workspaces/:id/join-requests — owner only, pending + requester summary. */
async function listJoinRequests(deps, session, workspaceId, response, config) {
	await requireOwner(config, deps.fetchImpl, session.userId, workspaceId);
	const rows = await rest(config, deps.fetchImpl, `osionos_join_requests?workspace_id=eq.${workspaceId}&status=eq.pending&select=*&order=created_at.asc`);
	const list = Array.isArray(rows) ? rows : [];
	const identities = await identitySummaries(config, deps.fetchImpl, list.map((row) => row.requester_id));
	const requests = list.map((row) => ({
		id: row.id,
		requesterId: row.requester_id,
		requesterName: identities.get(row.requester_id)?.name ?? 'Member',
		requesterAvatar: identities.get(row.requester_id)?.avatar ?? null,
		message: row.message ?? null,
		createdAt: row.created_at ?? null,
	}));
	return sendJson(response, 200, { ok: true, requests }, config);
}

/** GET /api/workspaces/:id/members — owner OR member may read the roster. */
async function listWorkspaceMembers(deps, session, workspaceId, response, config) {
	const workspace = await fetchWorkspace(config, deps.fetchImpl, workspaceId);
	if (!workspace) throw httpError('Workspace not found.', 404);
	const rows = await rest(config, deps.fetchImpl, `osionos_workspace_members?workspace_id=eq.${workspaceId}&select=user_id,role&order=role.asc`);
	const list = Array.isArray(rows) ? rows : [];
	const isMember = list.some((row) => row.user_id === session.userId);
	if (workspace.owner_id !== session.userId && !isMember) throw httpError('You are not a member of this workspace.', 403);
	const identities = await identitySummaries(config, deps.fetchImpl, list.map((row) => row.user_id));
	const members = list.map((row) => ({
		userId: row.user_id,
		name: identities.get(row.user_id)?.name ?? 'Member',
		avatar: identities.get(row.user_id)?.avatar ?? null,
		role: row.role ?? 'member',
	}));
	return sendJson(response, 200, { ok: true, members }, config);
}

/** PATCH /api/join-requests/:id {action:approve|deny} — owner only. */
async function decideJoinRequest(deps, session, request, requestId, response, config) {
	const payload = await readJsonBody(request);
	const action = safeText(payload.action, 16);
	if (action !== 'approve' && action !== 'deny') throw httpError('action must be approve|deny.', 422);
	const rows = await rest(config, deps.fetchImpl, `osionos_join_requests?id=eq.${requestId}&select=*&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) throw httpError('Join request not found.', 404);
	await requireOwner(config, deps.fetchImpl, session.userId, row.workspace_id);
	const status = action === 'approve' ? 'approved' : 'denied';
	if (action === 'approve') await addMember(config, deps.fetchImpl, row.workspace_id, row.requester_id);
	await rest(config, deps.fetchImpl, `osionos_join_requests?id=eq.${requestId}`, {
		method: 'PATCH',
		body: { status, decided_by: session.userId, decided_at: new Date().toISOString() },
		prefer: 'return=minimal',
	});
	if (action === 'approve') {
		await publishRealtime({
			topic: `user:${row.requester_id}`,
			eventType: 'join_decided',
			payload: { workspaceId: row.workspace_id, approved: true },
			fetchImpl: deps.fetchImpl,
			env: deps.env,
		});
	}
	return sendJson(response, 200, { ok: true, requestId, status }, config);
}

/** Owner OR member of the Shared space (workspace), else 403 — the single
 *  membership gate (AOC §I2) every collab subscription routes through. */
async function requireSpaceMembership(config, fetchImpl, userId, workspaceId) {
	const workspace = await fetchWorkspace(config, fetchImpl, workspaceId);
	if (!workspace) throw httpError('Shared space not found.', 404);
	if (workspace.owner_id === userId) return workspace;
	const rows = await rest(config, fetchImpl, `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${userId}&select=user_id&limit=1`);
	if (!(Array.isArray(rows) && rows.length)) throw httpError('You are not a member of this Shared space.', 403);
	return workspace;
}

/**
 * POST /api/collaboration/:id/realtime-token — the §Sec1 gate. Mints a realtime
 * token scoped to ONLY this Shared space's namespace `collab:<spaceId>` after
 * proving membership, so a non-member gets 403 and the token cannot reach any
 * other space (§Sec3). The client opens the gateway WS with this token.
 */
async function mintCollabRealtimeToken(deps, session, workspaceId, response, config) {
	await requireSpaceMembership(config, deps.fetchImpl, session.userId, workspaceId);
	const topic = `collab:${workspaceId}`;
	const { token, expiresAt } = mintRealtimeToken({
		secret: deps.env.JWT_SECRET ?? deps.env.REALTIME_JWT_SECRET,
		userId: session.userId,
		namespaces: [topic],
	});
	return sendJson(response, 200, { ok: true, token, expiresAt, topic, spaceId: workspaceId }, config);
}

/**
 * POST /api/collaboration/:id/uploads?name= — durable file seed (AOC §4/§6),
 * MEMBER-gated like the realtime token. Persists the raw bytes to storage FIRST
 * (the durable path), then returns a reference the client announces ephemerally
 * over the realtime transport — the bytes NEVER ride realtime. A non-member is
 * rejected here (403) before any storage write.
 */
async function seedSpaceFile(deps, session, url, request, workspaceId, response, config) {
	await requireSpaceMembership(config, deps.fetchImpl, session.userId, workspaceId);
	const buf = await readRawBody(request);
	if (buf.length === 0) throw httpError('Upload body is empty.', 422);
	const contentType = safeText(request.headers['content-type'], 160) || 'application/octet-stream';
	const sha256 = createHash('sha256').update(buf).digest('hex');
	const objectKey = storageObjectKey(sha256, extFromMime(contentType));
	await ensureChatBucket(session.userId, deps.fetchImpl, deps.env);
	await storagePut(session.userId, objectKey, contentType, buf, deps.fetchImpl, deps.env);
	const name = safeText(url.searchParams.get('name'), 200) || objectKey;
	return sendJson(response, 201, { ok: true, fileId: objectKey, name, sha256, bucket: 'chat', size: buf.length }, config);
}

/**
 * POST /api/collaboration/:id/invite {userId} — OWNER invites a teammate into a
 * Shared space (AOC §invites), reusing the same membership write the join-request
 * approval uses. Owner-only (403 otherwise); idempotent (re-inviting a member is
 * a no-op). The invited user appears in the roster on their next connect.
 */
async function inviteMember(deps, session, request, workspaceId, response, config) {
	await requireOwner(config, deps.fetchImpl, session.userId, workspaceId);
	const payload = await readJsonBody(request);
	const userId = safeText(payload.userId, 64);
	if (!UUID_REGEX.test(userId)) throw httpError('userId must be a valid id.', 422);
	await addMember(config, deps.fetchImpl, workspaceId, userId);
	return sendJson(response, 200, { ok: true, workspaceId, userId, role: 'viewer' }, config);
}

/**
 * Build the collaboration dispatcher: `await handler(url, request, response)` →
 * true when handled. deps: { config, verifySession, fetchImpl?, env? }.
 */
export function createCollabHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleCollabRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		const wsPatch = /^\/api\/workspaces\/([0-9a-f-]{36})$/i.exec(pathname);
		const wsRequests = /^\/api\/workspaces\/([0-9a-f-]{36})\/join-requests$/i.exec(pathname);
		const wsMembers = /^\/api\/workspaces\/([0-9a-f-]{36})\/members$/i.exec(pathname);
		const collabId = /^\/api\/collaboration\/([0-9a-f-]{36})$/i.exec(pathname);
		const collabJoin = /^\/api\/collaboration\/([0-9a-f-]{36})\/join$/i.exec(pathname);
		const rtToken = /^\/api\/collaboration\/([0-9a-f-]{36})\/realtime-token$/i.exec(pathname);
		const uploads = /^\/api\/collaboration\/([0-9a-f-]{36})\/uploads$/i.exec(pathname);
		const invite = /^\/api\/collaboration\/([0-9a-f-]{36})\/invite$/i.exec(pathname);
		const decideReq = /^\/api\/join-requests\/([0-9a-f-]{36})$/i.exec(pathname);
		const owns = pathname === '/api/collaboration' || wsRequests || wsMembers || collabId || collabJoin || rtToken || uploads || invite || decideReq || (wsPatch && (request.method || '').toUpperCase() === 'PATCH');
		if (!owns) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (wsPatch && method === 'PATCH') return await patchWorkspace(deps, session, request, requireUuid(wsPatch[1], 'workspaceId'), response, requestConfig);
			if (wsMembers && method === 'GET') return await listWorkspaceMembers(deps, session, requireUuid(wsMembers[1], 'workspaceId'), response, requestConfig);
			if (wsRequests && method === 'GET') return await listJoinRequests(deps, session, requireUuid(wsRequests[1], 'workspaceId'), response, requestConfig);
			if (pathname === '/api/collaboration' && method === 'GET') return await listCollaboration(deps, session, url, response, requestConfig);
			if (collabId && method === 'GET') return await getCollaboration(deps, session, requireUuid(collabId[1], 'workspaceId'), response, requestConfig);
			if (collabJoin && method === 'POST') return await joinCollaboration(deps, session, request, requireUuid(collabJoin[1], 'workspaceId'), response, requestConfig);
			if (rtToken && method === 'POST') return await mintCollabRealtimeToken(deps, session, requireUuid(rtToken[1], 'spaceId'), response, requestConfig);
			if (uploads && method === 'POST') return await seedSpaceFile(deps, session, url, request, requireUuid(uploads[1], 'spaceId'), response, requestConfig);
			if (invite && method === 'POST') return await inviteMember(deps, session, request, requireUuid(invite[1], 'spaceId'), response, requestConfig);
			if (decideReq && method === 'PATCH') return await decideJoinRequest(deps, session, request, requireUuid(decideReq[1], 'requestId'), response, requestConfig);
			return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Collaboration request failed.' }, requestConfig);
		}
	};
}
