/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-teams.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Teams: named groups of a workspace's members.
 *
 *   GET    /api/workspaces/:id/teams                          any member, keyset paged
 *   POST   /api/workspaces/:id/teams                          owner/admin  {name, description?}
 *   PATCH  /api/workspaces/:id/teams/:teamId                  owner/admin  {name?, description?}
 *   DELETE /api/workspaces/:id/teams/:teamId                  owner/admin, the members go with it
 *   GET    /api/workspaces/:id/teams/:teamId/members          any member, keyset paged
 *   POST   /api/workspaces/:id/teams/:teamId/members          owner/admin  {userId, role?}
 *   DELETE /api/workspaces/:id/teams/:teamId/members/:userId  owner/admin
 *
 * A team is a subset of the workspace: the member must already be in osionos_workspace_members.
 * The route checks it for a clean 422 and the composite foreign key of osionos_team_members
 * (models/osionos-teams-migration.sql) enforces it for every other writer. The owner is not
 * a team member unless added by hand. A stranger is told 404, a plain member 403 on a write.
 *
 * Caveat: the member count and the caller's own role are read for the page's teams in one
 * query, so a team above PostgREST's max-rows cap is counted at the cap. Names come from
 * osionos_people_directory and fall back to "Member" for an account with no directory row.
 * The duplicate-name and duplicate-member checks read first and write second: a racing
 * writer is caught by the unique constraint and answered 409 team_exists, not 500.
 */

import { UUID_REGEX, safeText, sendJson } from './bridge-social-core.mjs';
import { accountError, callerSession, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { decodeCursor, inFilter, keyset, pageOf } from './bridge-paging.mjs';
import { bumpAccessAfter } from './bridge-access-generation.mjs';

const ROUTE = /^\/api\/workspaces\/([0-9a-f-]{36})\/teams(?:\/([0-9a-f-]{36}))?(\/members)?(?:\/([0-9a-f-]{36}))?$/i;
const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;
const PAGE_MAX = 50;
const TEAM_ORDER = [['id', 'asc']];
const MEMBER_ORDER = [['user_id', 'asc']];
const ROLES = new Set(['member', 'lead']);
const TEAM_COLUMNS = 'id,name,description,created_at,updated_at';

const first = (rows) => (Array.isArray(rows) ? rows[0] ?? null : null);
const same = (left, right) => String(left).toLowerCase() === String(right).toLowerCase();
const teamNotFound = () => accountError(404, 'team_not_found', 'Team not found.');

// Owner, then member row. No row at all is a stranger: 404, no hint the workspace exists.
async function loadCaller(service, userId, workspaceId) {
	const workspace = first(await service.get(`osionos_workspaces?id=eq.${workspaceId}&select=id,owner_id&limit=1`));
	if (!workspace) throw accountError(404, 'workspace_not_found', 'Workspace not found.');
	if (same(workspace.owner_id, userId)) return { canWrite: true };
	const membership = first(await service.get(`osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${userId}&select=role&limit=1`));
	if (!membership) throw accountError(404, 'workspace_not_found', 'Workspace not found.');
	return { canWrite: String(membership.role ?? '').toLowerCase() === 'admin' };
}

async function requireAdmin(service, userId, workspaceId) {
	const caller = await loadCaller(service, userId, workspaceId);
	if (!caller.canWrite) throw accountError(403, 'forbidden', 'Only the workspace owner or an admin may do this.');
}

async function loadTeam(service, workspaceId, teamId) {
	const team = first(await service.get(`osionos_teams?id=eq.${teamId}&workspace_id=eq.${workspaceId}&archived_at=is.null&select=${TEAM_COLUMNS}&limit=1`));
	if (!team) throw teamNotFound();
	return team;
}

function textField(value, label, { max, min }) {
	if (typeof value !== 'string') throw accountError(422, 'invalid_field', `${label} must be a string.`);
	const text = safeText(value, 1000);
	if (text.length < min || text.length > max) throw accountError(422, 'invalid_field', `${label} must be between ${min} and ${max} characters.`);
	return text;
}

function teamFields(body, { partial }) {
	const fields = {};
	if (Object.hasOwn(body, 'name') || !partial) fields.name = textField(body.name, 'name', { min: 1, max: NAME_MAX });
	if (Object.hasOwn(body, 'description')) fields.description = textField(body.description, 'description', { min: 0, max: DESCRIPTION_MAX });
	return fields;
}

async function requireFreeName(service, workspaceId, name, exceptId) {
	const rows = await service.get(`osionos_teams?workspace_id=eq.${workspaceId}&name=eq.${encodeURIComponent(name)}&select=id&limit=2`);
	if ((Array.isArray(rows) ? rows : []).some((row) => !exceptId || !same(row.id, exceptId))) throw accountError(409, 'team_exists', 'A team with that name already exists.');
}

// A unique-violation that slipped past the read above (two creates racing) is the same 409.
async function writeTeam(write) {
	try {
		return await write();
	} catch (error) {
		if (error?.status === 409) throw accountError(409, 'team_exists', 'A team with that name already exists.');
		throw error;
	}
}

function teamView(row, memberCount, myRole) {
	return {
		id: row.id,
		name: row.name,
		description: row.description ?? '',
		createdAt: row.created_at ?? null,
		updatedAt: row.updated_at ?? null,
		memberCount,
		myRole,
	};
}

async function listTeams(ctx, service, session, url, workspaceId, response) {
	await loadCaller(service, session.userId, workspaceId);
	const rawCursor = url.searchParams.get('cursor');
	const cursor = rawCursor ? decodeCursor(rawCursor, TEAM_ORDER.length) : undefined;
	const { query, take } = keyset({ order: TEAM_ORDER, cursor, limit: url.searchParams.get('limit'), maxLimit: PAGE_MAX });
	const rows = await service.get(`osionos_teams?workspace_id=eq.${workspaceId}&archived_at=is.null&select=${TEAM_COLUMNS}&${query}`);
	const page = pageOf(Array.isArray(rows) ? rows : [], TEAM_ORDER, take);
	const counts = new Map();
	const mine = new Map();
	if (page.items.length > 0) {
		const memberRows = await service.get(`osionos_team_members?workspace_id=eq.${workspaceId}&${inFilter('team_id', page.items.map((team) => team.id))}&select=team_id,user_id,role`);
		for (const row of Array.isArray(memberRows) ? memberRows : []) {
			counts.set(row.team_id, (counts.get(row.team_id) ?? 0) + 1);
			if (same(row.user_id, session.userId)) mine.set(row.team_id, row.role);
		}
	}
	const teams = page.items.map((team) => teamView(team, counts.get(team.id) ?? 0, mine.get(team.id) ?? null));
	return ctx.reply(response, 200, { ok: true, teams, nextCursor: page.nextCursor });
}

async function createTeam(ctx, service, session, request, workspaceId, response) {
	await requireAdmin(service, session.userId, workspaceId);
	const fields = teamFields(await readBody(request), { partial: false });
	await requireFreeName(service, workspaceId, fields.name);
	const created = first(await writeTeam(() => bumpAccessAfter(service.post('osionos_teams', { workspace_id: workspaceId, description: '', ...fields, created_by: session.userId }, { prefer: 'return=representation' }), { workspaceId })));
	if (!created) throw accountError(502, 'team_not_saved', 'The team could not be saved.');
	return ctx.reply(response, 201, { ok: true, team: teamView(created, 0, null) });
}

async function updateTeam(ctx, service, session, request, workspaceId, teamId, response) {
	await requireAdmin(service, session.userId, workspaceId);
	await loadTeam(service, workspaceId, teamId);
	const fields = teamFields(await readBody(request), { partial: true });
	if (Object.keys(fields).length === 0) throw accountError(422, 'invalid_field', 'Send a name or a description.');
	if (Object.hasOwn(fields, 'name')) await requireFreeName(service, workspaceId, fields.name, teamId);
	const patched = first(await writeTeam(() => bumpAccessAfter(service.patch(`osionos_teams?id=eq.${teamId}&workspace_id=eq.${workspaceId}&select=${TEAM_COLUMNS}`, { ...fields, updated_at: new Date().toISOString() }, { prefer: 'return=representation' }), { workspaceId })));
	if (!patched) throw teamNotFound();
	const counted = await service.get(`osionos_team_members?team_id=eq.${teamId}&select=user_id`);
	return ctx.reply(response, 200, { ok: true, team: teamView(patched, Array.isArray(counted) ? counted.length : 0, null) });
}

async function deleteTeam(ctx, service, session, workspaceId, teamId, response) {
	await requireAdmin(service, session.userId, workspaceId);
	await loadTeam(service, workspaceId, teamId);
	// The member rows go with the team through the foreign key's ON DELETE CASCADE.
	await bumpAccessAfter(service.del(`osionos_teams?id=eq.${teamId}&workspace_id=eq.${workspaceId}`, { prefer: 'return=minimal' }), { workspaceId });
	return ctx.reply(response, 200, { ok: true, deleted: true });
}

async function directoryNames(service, userIds) {
	const names = new Map();
	if (userIds.length === 0) return names;
	const rows = await service.get(`osionos_people_directory?${inFilter('user_id', userIds)}&select=user_id,display_name`);
	for (const row of Array.isArray(rows) ? rows : []) if (typeof row.display_name === 'string' && row.display_name) names.set(String(row.user_id).toLowerCase(), row.display_name);
	return names;
}

async function listMembers(ctx, service, session, url, workspaceId, teamId, response) {
	await loadCaller(service, session.userId, workspaceId);
	await loadTeam(service, workspaceId, teamId);
	const rawCursor = url.searchParams.get('cursor');
	const cursor = rawCursor ? decodeCursor(rawCursor, MEMBER_ORDER.length) : undefined;
	const { query, take } = keyset({ order: MEMBER_ORDER, cursor, limit: url.searchParams.get('limit'), maxLimit: PAGE_MAX });
	const rows = await service.get(`osionos_team_members?team_id=eq.${teamId}&workspace_id=eq.${workspaceId}&select=user_id,role,created_at&${query}`);
	const page = pageOf(Array.isArray(rows) ? rows : [], MEMBER_ORDER, take);
	const names = await directoryNames(service, page.items.map((row) => row.user_id));
	const members = page.items.map((row) => ({ userId: row.user_id, name: names.get(String(row.user_id).toLowerCase()) ?? 'Member', role: row.role, addedAt: row.created_at ?? null }));
	return ctx.reply(response, 200, { ok: true, members, nextCursor: page.nextCursor });
}

async function addMember(ctx, service, session, request, workspaceId, teamId, response) {
	await requireAdmin(service, session.userId, workspaceId);
	await loadTeam(service, workspaceId, teamId);
	const body = await readBody(request);
	if (typeof body.userId !== 'string' || !UUID_REGEX.test(body.userId)) throw accountError(422, 'invalid_field', 'userId must be a user id.');
	const role = body.role === undefined ? 'member' : body.role;
	if (typeof role !== 'string' || !ROLES.has(role)) throw accountError(422, 'invalid_field', 'role must be member or lead.');
	const userId = body.userId.toLowerCase();
	const workspaceMember = first(await service.get(`osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${userId}&select=user_id&limit=1`));
	if (!workspaceMember) throw accountError(422, 'not_a_workspace_member', 'Only a member of the workspace can join one of its teams.');
	const existing = first(await service.get(`osionos_team_members?team_id=eq.${teamId}&user_id=eq.${userId}&select=user_id&limit=1`));
	if (existing) {
		await bumpAccessAfter(service.patch(`osionos_team_members?team_id=eq.${teamId}&user_id=eq.${userId}`, { role, updated_at: new Date().toISOString() }, { prefer: 'return=minimal' }), { workspaceId, userId });
		return ctx.reply(response, 200, { ok: true, status: 'updated', member: { userId, role } });
	}
	await bumpAccessAfter(service.post('osionos_team_members', { workspace_id: workspaceId, team_id: teamId, user_id: userId, role, added_by: session.userId }, { prefer: 'return=minimal' }), { workspaceId, userId });
	return ctx.reply(response, 201, { ok: true, status: 'added', member: { userId, role } });
}

async function removeMember(ctx, service, session, workspaceId, teamId, userId, response) {
	await requireAdmin(service, session.userId, workspaceId);
	await loadTeam(service, workspaceId, teamId);
	const removed = await bumpAccessAfter(service.del(`osionos_team_members?team_id=eq.${teamId}&user_id=eq.${userId.toLowerCase()}&select=user_id`, { prefer: 'return=representation' }), { workspaceId, userId: userId.toLowerCase() });
	if (!Array.isArray(removed) || removed.length === 0) throw accountError(404, 'member_not_found', 'That user is not in this team.');
	return ctx.reply(response, 200, { ok: true, removed: true });
}

function dispatch(ctx, service, session, request, url, match, response) {
	const [, workspaceId, teamId, members, userId] = match.map((part) => part?.toLowerCase());
	const method = (request.method || 'GET').toUpperCase();
	const shape = `${teamId ? 'team' : 'teams'}${members ? '/members' : ''}${userId ? '/user' : ''}`;
	const table = {
		'GET teams': () => listTeams(ctx, service, session, url, workspaceId, response),
		'POST teams': () => createTeam(ctx, service, session, request, workspaceId, response),
		'PATCH team': () => updateTeam(ctx, service, session, request, workspaceId, teamId, response),
		'DELETE team': () => deleteTeam(ctx, service, session, workspaceId, teamId, response),
		'GET team/members': () => listMembers(ctx, service, session, url, workspaceId, teamId, response),
		'POST team/members': () => addMember(ctx, service, session, request, workspaceId, teamId, response),
		'DELETE team/members/user': () => removeMember(ctx, service, session, workspaceId, teamId, userId, response),
	};
	return table[`${method} ${shape}`] ?? null;
}

export function createWorkspaceTeamsRoutes({ config, pg, verifySession }) {
	const ctx = { reply: (res, status, body) => sendJson(res, status, body, config) };
	return async function handleWorkspaceTeams(url, request, response) {
		const match = ROUTE.exec(url.pathname);
		if (!match) return false;
		if (match[3] === undefined && match[4] !== undefined) return false;
		try {
			const session = callerSession(request, config, verifySession);
			const run = dispatch(ctx, pg.asService(), session, request, url, match, response);
			if (!run) return false;
			await run();
			return true;
		} catch (error) {
			respondWithError(response, error, config);
			return true;
		}
	};
}
