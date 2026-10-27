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

import { createHash } from 'node:crypto';
import {
	UUID_REGEX,
	bearerToken,
	httpError,
	identitySummaries,
	notifyTokenFor,
	publishRealtime,
	readJsonBody,
	requireUuid,
	rest,
	safeText,
	sendJson,
	userTopic,
	workspaceMembership,
} from './bridge-social-core.mjs';
import { readRawBody } from './bridge-chat-media.mjs';
import { ensureChatBucket, extFromMime, storageObjectKey, storagePut } from './bridge-storage-core.mjs';
import { REALTIME_TOKEN_ISSUER, signRealtimeJwt } from './bridge-realtime-socket.mjs';
import { createInviteForUser } from './bridge-workspace-invites.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { beginServerTiming, markHop, runWithServerTiming, timedHop } from './bridge-server-timing.mjs';

// Caveat: this token lives 1 h. The client does not re-mint it before expiry
// (fetchSharedSpaceToken in src/features/collab/api/grobaseTransport.factory.ts is
// called once at join, with no refresh path), so lowering it to 900 s would drop
// live Shared-space sockets every 15 min. Left at 3600 s accordingly (C129).
const REALTIME_TOKEN_TTL_SECONDS = 3600;

/**
 * Mint a short-lived HS256 realtime token the grobase gateway accepts
 * (REALTIME_JWT_SECRET = the shared JWT_SECRET, no audience). `namespaces` is the
 * EXACT topic allow-list the gateway authorizes against (can_subscribe_to: an
 * entry must equal the topic's namespace; an empty list grants nothing), so the
 * token's reach is precisely the namespaces passed in — never a wildcard.
 */
export function mintRealtimeToken({ secret, userId, namespaces, ttlSeconds = REALTIME_TOKEN_TTL_SECONDS, canPublish = true, metadata, now = Date.now() }) {
	if (!secret) throw httpError('Realtime signing secret (JWT_SECRET) is not configured.', 503);
	const issuedAt = Math.floor(now / 1000);
	const exp = issuedAt + Math.min(Math.max(Number(ttlSeconds) || REALTIME_TOKEN_TTL_SECONDS, 60), 86400);
	// The gateway refuses a token without `iss` (REALTIME_JWT_ALLOW_NO_ISSUER off): without it
	// every collab socket got AUTH_FAILED (measured live 2026-10-14).
	const payload = { iss: REALTIME_TOKEN_ISSUER, sub: String(userId), iat: issuedAt, exp, namespaces, can_subscribe: true, can_publish: canPublish === true };
	// Additive: old tokens carry exactly the same claims (no `metadata` key).
	if (metadata !== undefined) payload.metadata = metadata;
	return { token: signRealtimeJwt(payload, secret), expiresAt: new Date(exp * 1000).toISOString() };
}

const PAGE_SCOPED_EVENTS = new Set(['blocks', 'caret', 'selection', 'focus', 'note', 'file', 'activity', 'nav']);
const ACCESS_RANK = { none: 0, can_view: 1, can_comment: 2, can_edit: 3, full_access: 4 };
// Page tokens: one bucket per user, ~1 page/s with a burst of 20. Kept apart from
// the main `realtime-token:` bucket so opening many pages cannot starve it (C573).
const PAGE_TOKEN_BUCKET = { capacity: 20, refillPerSec: 1 };
// Flag-on events: 200/s per sender with a burst of 400 (C571).
const EVENT_BUCKET = { capacity: 400, refillPerSec: 200 };
// Directed req/res: 10/min per (sender,target), burst 5; retained for the hour.
const DIRECT_BUCKET = { capacity: 5, refillPerSec: 10 / 60, retainMs: 60 * 60_000 };
const UUID_GLOBAL = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const CID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TAB_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

function levelAtLeast(level, required) {
	return (ACCESS_RANK[level] ?? 0) >= ACCESS_RANK[required];
}

/** An unknown/missing level from the injected adapter fails closed. */
function normalizedLevel(level) {
	return typeof level === 'string' && Object.hasOwn(ACCESS_RANK, level) ? level : 'none';
}

/** A request/reply correlation id: 1..64 chars of [A-Za-z0-9_-] (C572). */
function requireCid(value) {
	if (typeof value !== 'string' || !CID_RE.test(value)) throw httpError('invalid_cid', 422);
	return value;
}

/** The accepted flag of a summon reply, reduced to `{ accepted }` (C572). */
function requireAccepted(res) {
	if (!res || typeof res !== 'object' || typeof res.accepted !== 'boolean') throw httpError('invalid_res', 422);
	return { accepted: res.accepted };
}


/** Force the actor prefix to the session user while keeping a valid tab suffix (f1b). */
function normalizePublishedActor(sessionUserId, clientActor) {
	if (typeof clientActor !== 'string' || !clientActor.includes(':')) return sessionUserId;
	const suffix = clientActor.slice(clientActor.indexOf(':') + 1);
	if (!TAB_ID_RE.test(suffix)) throw httpError('invalid_actor', 422);
	return `${sessionUserId}:${suffix}`;
}

/**
 * Start a read now and let the caller await it later. A rejection nobody awaits (the
 * caller bailed out first on the membership verdict) is swallowed, never unhandled.
 */
function softStart(read) {
	const started = (async () => read())();
	started.catch(() => {});
	return started;
}

/** A present seq must be a finite integer; an absent seq stays absent (f1b). */
function requireOptionalSeq(value) {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value)) throw httpError('invalid_seq', 422);
	return value;
}

async function isSpaceMember(config, fetchImpl, userId, workspaceId) {
	// The workspace owner is a member even without a members row (same rule as
	// requireSpaceMembership above).
	const workspace = await fetchWorkspace(config, fetchImpl, workspaceId);
	if (!workspace) return false;
	if (workspace.owner_id === userId) return true;
	const rows = await rest(config, fetchImpl, `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${userId}&select=user_id&limit=1`);
	return Array.isArray(rows) && rows.length > 0;
}

/** The uuids a summon route names, whether it is a string or a structured route. */
function routeUuids(route) {
	const text = typeof route === 'string' ? route : JSON.stringify(route ?? '');
	return [...text.matchAll(UUID_GLOBAL)].map((match) => match[0].toLowerCase());
}

/** The ids among `uuids` that are pages of `workspaceId` (one read). */
async function pagesOfWorkspace(config, fetchImpl, uuids, workspaceId) {
	if (uuids.length === 0) return [];
	const rows = await rest(config, fetchImpl, `osionos_pages?id=in.(${uuids.join(',')})&workspace_id=eq.${workspaceId}&select=id`);
	return (Array.isArray(rows) ? rows : []).map((row) => String(row.id).toLowerCase());
}

/** Publish to one user's inbox, refusing (404) when they have no notify token. */
async function publishToUser(deps, config, userId, body) {
	const token = await notifyTokenFor(config, deps.fetchImpl, userId);
	if (!token) throw httpError('User not found.', 404);
	const published = await publishRealtime({ topic: userTopic(token), eventType: 'broadcast', payload: body, fetchImpl: deps.fetchImpl, env: deps.env });
	if (!published) throw httpError('Collaboration publish failed.', 503);
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

/**
 * GET /api/collaboration/:id — workspace meta + a single entry page. Only DISCOVERABLE
 * workspaces have a preview (an unknown visibility stays hidden), and a non-member's
 * entry page must be public: a page shared with the workspace stays inside it.
 */
async function getCollaboration(deps, session, workspaceId, response, config) {
	const workspace = await fetchWorkspace(config, deps.fetchImpl, workspaceId);
	if (!workspace || !DISCOVERABLE.has(workspace.visibility)) throw httpError('Workspace not found.', 404);
	const isMember = workspace.owner_id === session.userId
		|| await workspaceMembership(config, deps.fetchImpl, session.userId, workspaceId) !== null;
	const entryVisibility = isMember ? 'in.(public,shared)' : 'eq.public';
	const pageRows = await rest(config, deps.fetchImpl, `osionos_pages?workspace_id=eq.${workspaceId}&visibility=${entryVisibility}&select=id,title,icon,cover,content&order=created_at.asc&limit=1`);
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

/**
 * POST /api/collaboration/:id/join {message?} — public joins, gated requests. Only
 * DISCOVERABLE workspaces take either; any other visibility answers like a missing one.
 */
async function joinCollaboration(deps, session, request, workspaceId, response, config) {
	const workspace = await fetchWorkspace(config, deps.fetchImpl, workspaceId);
	if (!workspace || !DISCOVERABLE.has(workspace.visibility)) throw httpError('Workspace not found.', 404);
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
	// G6 F9: decide membership before the roster is read, not from the roster itself.
	await requireSpaceMembership(config, deps.fetchImpl, session.userId, workspaceId);
	const rows = await rest(config, deps.fetchImpl, `osionos_workspace_members?workspace_id=eq.${workspaceId}&select=user_id,role&order=role.asc`);
	const list = Array.isArray(rows) ? rows : [];
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
		canPublish: false, // Publishing goes through the page-authorized bridge route.
	});
	return sendJson(response, 200, { ok: true, token, expiresAt, topic, spaceId: workspaceId }, config);
}

/**
 * POST /api/collaboration/:ws/pages/:pageId/realtime-token — a token scoped to ONE
 * page topic (`collabpage:<pageId>`), minted only for a caller who can read that
 * page. `pageLevelFor` is injected (bridge-api.mjs builds it from the page-read
 * path) so this module never guesses a page's ACL; an unknown level fails closed.
 * A page the caller cannot read, a missing page, and a page of another Shared
 * space all answer the SAME 404, so the route never confirms that a page exists.
 */
async function mintPageRealtimeToken(deps, session, workspaceId, pageId, response, config) {
	takeToken(`collabpage-token:${session.userId}`, PAGE_TOKEN_BUCKET);
	await requireSpaceMembership(config, deps.fetchImpl, session.userId, workspaceId);
	const level = normalizedLevel(await deps.pageLevelFor?.(session.userId, pageId, workspaceId));
	if (level === 'none') throw httpError('Page not found.', 404);
	const topic = `collabpage:${pageId.toLowerCase()}`;
	const { token, expiresAt } = mintRealtimeToken({
		secret: deps.env.JWT_SECRET ?? deps.env.REALTIME_JWT_SECRET,
		userId: session.userId,
		namespaces: [topic],
		canPublish: false, // Publishing goes through the page-authorized bridge route.
		metadata: { level },
	});
	return sendJson(response, 200, { ok: true, token, expiresAt, topic, pageId, level }, config);
}

/**
 * The flag-on routing of one collaboration event. Content goes only to the page
 * topic its readers may subscribe to; the workspace topic keeps the workspace-wide
 * `pages` nudge (reduced to ids-free keys) and nothing else.
 */
async function publishPageScopedEvent(deps, session, request, body, payload, workspaceId, config) {
	if (body.event === 'collab') {
		if (payload.t === 'pages') {
			if (payload.workspaceId?.toLowerCase() !== workspaceId.toLowerCase()) throw httpError('Invalid event workspace.', 403);
			const actor = normalizePublishedActor(session.userId, payload.actor);
			const seq = requireOptionalSeq(payload.seq);
			await deps.requireMember();
			// Whitelist only: nothing else the client sent reaches the workspace topic.
			const pagePayload = { t: 'pages', actor, workspaceId };
			if (seq !== undefined) pagePayload.seq = seq;
			const frame = { event: 'collab', payload: pagePayload };
			const published = await publishRealtime({ topic: `collab:${workspaceId}`, eventType: 'broadcast', payload: frame, fetchImpl: deps.fetchImpl, env: deps.env });
			if (!published) throw httpError('Collaboration publish failed.', 503);
			return;
		}
		if (!PAGE_SCOPED_EVENTS.has(payload.t)) throw httpError('unknown_event', 422);
		if (payload.seq !== undefined) requireOptionalSeq(payload.seq);
		if (!UUID_REGEX.test(String(payload.pageId ?? ''))) throw httpError('page_id_required', 422);
		const pageId = requireUuid(payload.pageId, 'pageId').toLowerCase();
		const publishedActor = normalizePublishedActor(session.userId, payload.actor);
		// Membership gates the answer, but the page reads start with it: the membership
		// verdict is awaited first, so a non-member never sees a page-level answer.
		const levelRead = softStart(() => timedHop('access', () => deps.pageLevelFor?.(session.userId, pageId, workspaceId, deps.scope)));
		const blocksRead = payload.t === 'blocks' && Array.isArray(payload.ops) && deps.authorizeBlocks
			? softStart(() => timedHop('access', () => deps.authorizeBlocks(request, pageId, workspaceId, deps.scope)))
			: null;
		await deps.requireMember();
		const level = normalizedLevel(await levelRead);
		if (level === 'none') throw httpError('Page not found.', 404);
		if (!levelAtLeast(level, 'can_view')) throw httpError('Page read access is required.', 403);
		// The level alone under-grants: a member with no page rule reads 'can_view' and
		// writes through the membership's update permission (C558). Writes therefore go
		// through the same gate PATCH /pages uses, never through the level.
		const writes = payload.t === 'blocks' || payload.t === 'file'
			|| (payload.t === 'note' && !levelAtLeast(level, 'can_comment'));
		if (writes) {
			if ((payload.t === 'blocks' && !Array.isArray(payload.ops)) || !deps.authorizeBlocks) throw httpError('Page write access is required.', 403);
			// A blocks write started its gate read next to the level read; the others start it now.
			await (blocksRead ?? timedHop('access', () => deps.authorizeBlocks(request, pageId, workspaceId, deps.scope)));
		}
		// The topic is lowercased; the published payload names the same page (C574).
		const frame = { event: 'collab', payload: { ...payload, pageId, actor: publishedActor } };
		const published = await timedHop('publish', () => publishRealtime({ topic: `collabpage:${pageId}`, eventType: 'broadcast', payload: frame, fetchImpl: deps.fetchImpl, env: deps.env }));
		if (!published) throw httpError('Collaboration publish failed.', 503);
		return;
	}
	if (body.event === 'collab.req') {
		const cid = requireCid(payload.cid);
		const target = String(payload.target ?? '');
		if (UUID_REGEX.test(target)) await deps.requireMember();
		if (!UUID_REGEX.test(target) || !await isSpaceMember(config, deps.fetchImpl, target, workspaceId)) throw httpError('User not found.', 404);
		// A summon that names a page of THIS Shared space needs the target to read it.
		const routePageIds = await pagesOfWorkspace(config, deps.fetchImpl, routeUuids(payload.req?.route), workspaceId);
		for (const pageId of routePageIds) {
			if (normalizedLevel(await deps.pageLevelFor?.(target, pageId, workspaceId)) === 'none') throw httpError('Page not found.', 404);
		}
		takeToken(`collab-direct:${session.userId}:${target}`, DIRECT_BUCKET);
		const reqPayload = { ...payload, cid, from: session.userId };
		if (payload.actor !== undefined) reqPayload.actor = normalizePublishedActor(session.userId, payload.actor);
		await publishToUser(deps, config, target, { event: 'collab.req', payload: reqPayload });
		return;
	}
	// collab.res: only { cid, from, res:{accepted} } reaches the recipient's inbox.
	const cid = requireCid(payload.cid);
	const res = requireAccepted(payload.res);
	const to = String(payload.to ?? '');
	if (UUID_REGEX.test(to)) await deps.requireMember();
	if (!UUID_REGEX.test(to) || !await isSpaceMember(config, deps.fetchImpl, to, workspaceId)) throw httpError('User not found.', 404);
	takeToken(`collab-direct:${session.userId}:${to}`, DIRECT_BUCKET);
	await publishToUser(deps, config, to, { event: 'collab.res', payload: { cid, from: session.userId, res } });
}

/**
 * Publish ephemeral events only after authenticating their sender and page write access.
 * With COLLAB_PAGE_TOPICS=1 content is routed to `collabpage:<pageId>` (readers only)
 * instead of the workspace topic; flag off keeps the historic workspace-topic path.
 */
async function publishCollabEvent(handlerDeps, session, request, workspaceId, response, config) {
	// Per request and dropped with it: the membership verdict and the page reads shared
	// by pageLevelFor and authorizeBlocks. Nothing is cached across requests.
	let membership;
	const deps = {
		...handlerDeps,
		scope: { session },
		requireMember: () => (membership ??= timedHop('membership', () => requireSpaceMembership(config, handlerDeps.fetchImpl, session.userId, workspaceId))),
	};
	const body = await readJsonBody(request);
	if (!['collab', 'collab.req', 'collab.res'].includes(body?.event) || !body?.payload || typeof body.payload !== 'object') {
		throw httpError('Invalid collaboration event.', 422);
	}
	if (Buffer.byteLength(JSON.stringify(body)) > 65_536) throw httpError('Collaboration event is too large.', 413);
	const payload = body.payload;
	if (body.event === 'collab' && deps.env?.COLLAB_PAGE_TOPICS !== '1') {
		const actor = payload.actor;
		if (typeof actor !== 'string' || !(actor.toLowerCase() === session.userId.toLowerCase()
			|| actor.toLowerCase().startsWith(`${session.userId.toLowerCase()}:`))) throw httpError('Invalid event actor.', 403);
	}
	if (body.event === 'collab.req') payload.from = session.userId;
	if (deps.env?.COLLAB_PAGE_TOPICS === '1') {
		takeToken(`collab-events:${session.userId}`, EVENT_BUCKET);
		await publishPageScopedEvent(deps, session, request, body, payload, workspaceId, config);
		return sendJson(response, 200, { ok: true }, config);
	}
	// Flag off: same checks and wire bytes as the historic path.
	if (body.event === 'collab') {
		if (payload.t === 'blocks') {
			const pageId = requireUuid(payload.pageId, 'pageId');
			if (!Array.isArray(payload.ops) || !deps.authorizeBlocks) throw httpError('Page write access is required.', 403);
			const blocksRead = softStart(() => timedHop('access', () => deps.authorizeBlocks(request, pageId, workspaceId, deps.scope)));
			await deps.requireMember();
			await blocksRead;
		}
		if (payload.t === 'pages' && payload.workspaceId?.toLowerCase() !== workspaceId.toLowerCase()) throw httpError('Invalid event workspace.', 403);
	}
	await deps.requireMember();
	const published = await timedHop('publish', () => publishRealtime({ topic: `collab:${workspaceId}`, eventType: 'broadcast', payload: body, fetchImpl: deps.fetchImpl, env: deps.env }));
	if (!published) throw httpError('Collaboration publish failed.', 503);
	return sendJson(response, 200, { ok: true }, config);
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
 * POST /api/collaboration/:id/invite {userId} — owner/admin creates a PENDING workspace
 * invite for that account (C513), through the SAME create path as
 * POST /api/workspaces/:id/invites. No member row is written: membership happens only
 * when the invitee accepts. Guest maps to the invite table's read-only `viewer` role.
 */
async function inviteMember(deps, session, request, workspaceId, response, config) {
	const payload = await readJsonBody(request);
	const userId = safeText(payload.userId, 64);
	if (!UUID_REGEX.test(userId)) throw httpError('userId must be a valid id.', 422);
	const { row } = await createInviteForUser({
		deps, session, workspaceId, userId, role: 'guest', config,
	});
	return sendJson(response, 200, {
		ok: true, workspaceId, userId, role: 'viewer', inviteId: row?.id ?? null, pending: true,
	}, config);
}

/**
 * Build the collaboration dispatcher: `await handler(url, request, response)` →
 * true when handled. deps: { config, verifySession, fetchImpl?, env? }.
 */
export function createCollabHandler({ config, verifySession, fetchImpl = fetch, env = process.env, authorizeBlocks, pageLevelFor }) {
	const deps = { fetchImpl, env, authorizeBlocks, pageLevelFor };
	return async function handleCollabRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		const wsPatch = /^\/api\/workspaces\/([0-9a-f-]{36})$/i.exec(pathname);
		const wsRequests = /^\/api\/workspaces\/([0-9a-f-]{36})\/join-requests$/i.exec(pathname);
		const wsMembers = /^\/api\/workspaces\/([0-9a-f-]{36})\/members$/i.exec(pathname);
		const collabId = /^\/api\/collaboration\/([0-9a-f-]{36})$/i.exec(pathname);
		const collabJoin = /^\/api\/collaboration\/([0-9a-f-]{36})\/join$/i.exec(pathname);
		const rtToken = /^\/api\/collaboration\/([0-9a-f-]{36})\/realtime-token$/i.exec(pathname);
		const pageRtToken = /^\/api\/collaboration\/([0-9a-f-]{36})\/pages\/([0-9a-f-]{36})\/realtime-token$/i.exec(pathname);
		const events = /^\/api\/collaboration\/([0-9a-f-]{36})\/events$/i.exec(pathname);
		const uploads = /^\/api\/collaboration\/([0-9a-f-]{36})\/uploads$/i.exec(pathname);
		const invite = /^\/api\/collaboration\/([0-9a-f-]{36})\/invite$/i.exec(pathname);
		const decideReq = /^\/api\/join-requests\/([0-9a-f-]{36})$/i.exec(pathname);
		const owns = pathname === '/api/collaboration' || wsRequests || wsMembers || collabId || collabJoin || rtToken || pageRtToken || events || uploads || invite || decideReq || (wsPatch && (request.method || '').toUpperCase() === 'PATCH');
		if (!owns) return false;
		const method = (request.method || 'GET').toUpperCase();
		const timing = events && method === 'POST' ? beginServerTiming(deps.env, response) : null;
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			markHop(timing, 'session');
			if (events && method === 'POST') return await runWithServerTiming(timing, () => publishCollabEvent(deps, session, request, requireUuid(events[1], 'workspaceId'), response, requestConfig));
			if (wsPatch && method === 'PATCH') return await patchWorkspace(deps, session, request, requireUuid(wsPatch[1], 'workspaceId'), response, requestConfig);
			if (wsMembers && method === 'GET') return await listWorkspaceMembers(deps, session, requireUuid(wsMembers[1], 'workspaceId'), response, requestConfig);
			if (wsRequests && method === 'GET') return await listJoinRequests(deps, session, requireUuid(wsRequests[1], 'workspaceId'), response, requestConfig);
			if (pathname === '/api/collaboration' && method === 'GET') return await listCollaboration(deps, session, url, response, requestConfig);
			if (collabId && method === 'GET') return await getCollaboration(deps, session, requireUuid(collabId[1], 'workspaceId'), response, requestConfig);
			if (collabJoin && method === 'POST') return await joinCollaboration(deps, session, request, requireUuid(collabJoin[1], 'workspaceId'), response, requestConfig);
			if (pageRtToken && method === 'POST') return await mintPageRealtimeToken(deps, session, requireUuid(pageRtToken[1], 'spaceId'), requireUuid(pageRtToken[2], 'pageId'), response, requestConfig);
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
