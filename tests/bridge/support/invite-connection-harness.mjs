/* ************************************************************************** */
/*                                                                            */
/*   invite-connection-harness.mjs                      :+:      :+:    :+:   */
/*                                                                            */
/* ************************************************************************** */

// Direct HTTP-handler harness for the friendship-gated membership writers. The only
// network double is the external PostgREST/GoTrue/realtime boundary; routing and stores run.

import { createHash } from 'node:crypto';

import { createCollabHandler } from '../../../scripts/bridge-collab.mjs';
import { createWorkspaceInvitesHandler, createInviteForUser } from '../../../scripts/bridge-workspace-invites.mjs';
import { createPostgrestMock } from './bridge-harness.mjs';

export const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
export const INVITEE = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
export const PRIVATE_WS = 'c0c0c0c0-3333-4333-8333-c0c0c0c0c0c0';
export const PUBLIC_WS = 'c1c1c1c1-3333-4333-8333-c1c1c1c1c1c1';
export const REQUEST_WS = 'c2c2c2c2-3333-4333-8333-c2c2c2c2c2c2';
export const RESEND_INVITE = 'b0b0b0b0-0000-4000-8000-000000000001';
export const ACCEPT_INVITE = 'b0b0b0b0-0000-4000-8000-000000000002';
export const JOIN_REQUEST = 'b0b0b0b0-0000-4000-8000-000000000003';
export const TOKEN = 'T'.repeat(43);
export const INVITEE_EMAIL = 'bob@example.com';

const CONFIG = {
	allowedOrigin: '*',
	appUrl: 'http://app.test',
	baasUrl: 'http://baas.local',
	serviceKey: 'service-key',
};
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const future = (days = 1) => new Date(Date.now() + days * 86_400_000).toISOString();

export function manualEdge(requester = OWNER, addressee = INVITEE) {
	return { requester_id: requester, addressee_id: addressee, status: 'accepted', source: 'manual' };
}

export function colleagueEdge(requester = OWNER, addressee = INVITEE) {
	return { ...manualEdge(requester, addressee), source: 'colleague' };
}

export function blockRow(blocker = OWNER, blocked = INVITEE) {
	return { blocker_id: blocker, blocked_id: blocked, reason: null, created_at: '2026-10-01T00:00:00.000Z' };
}

export function fixtureWorld(extra = {}) {
	return {
		osionos_workspaces: [
			{ id: PRIVATE_WS, owner_id: OWNER, name: 'Private', slug: 'private', visibility: 'confidential' },
			{ id: PUBLIC_WS, owner_id: OWNER, name: 'Public', slug: 'public', visibility: 'public' },
			{ id: REQUEST_WS, owner_id: OWNER, name: 'Requests', slug: 'requests', visibility: 'request_to_join' },
		],
		osionos_workspace_members: [],
		osionos_workspace_invites: [
			{
				id: RESEND_INVITE, workspace_id: PRIVATE_WS, email: INVITEE_EMAIL, invited_user_id: INVITEE,
				role: 'viewer', token_hash: sha256('resend-token'), expires_at: future(), accepted_at: null,
				accepted_by: null, revoked_at: null, invited_by: OWNER, created_at: '2026-10-01T00:00:00.000Z',
				updated_at: '2026-10-01T00:00:00.000Z',
			},
			{
				id: ACCEPT_INVITE, workspace_id: PRIVATE_WS, email: INVITEE_EMAIL, invited_user_id: INVITEE,
				role: 'viewer', token_hash: sha256(TOKEN), expires_at: future(), accepted_at: null,
				accepted_by: null, revoked_at: null, invited_by: OWNER, created_at: '2026-10-01T00:00:00.000Z',
				updated_at: '2026-10-01T00:00:00.000Z',
			},
		],
		osionos_join_requests: [
			{ id: JOIN_REQUEST, workspace_id: REQUEST_WS, requester_id: INVITEE, status: 'pending', message: null },
		],
		osionos_connections: [],
		osionos_user_blocks: [],
		osionos_people_directory: [
			{ user_id: OWNER, display_name: 'Alice', profile: {} },
			{ user_id: INVITEE, display_name: 'Bob', profile: {} },
		],
		...extra,
	};
}

function request(body, method = 'POST', userId = OWNER) {
	const json = body === undefined ? '' : JSON.stringify(body);
	return {
		method,
		headers: { authorization: `Bearer ${userId}`, 'content-type': 'application/json' },
		async *[Symbol.asyncIterator]() { if (json) yield json; },
	};
}

function response() {
	const written = { status: 0, text: '' };
	return {
		written,
		writeHead(status) { written.status = status; },
		end(text) { written.text = text ?? ''; },
	};
}

function json(value, status = 200) {
	return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

function backend(seed, users) {
	const mock = createPostgrestMock(seed);
	const publishes = [];
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		if (parsed.pathname === '/auth/v1/admin/users') {
			const filter = String(parsed.searchParams.get('filter') ?? '').toLowerCase();
			return json({ users: users.filter((user) => String(user.email).toLowerCase().includes(filter)) });
		}
		if (parsed.pathname.startsWith('/auth/v1/admin/users/')) {
			const id = decodeURIComponent(parsed.pathname.slice('/auth/v1/admin/users/'.length));
			const user = users.find((entry) => entry.id === id);
			return user ? json(user) : json({ message: 'not found' }, 404);
		}
		if (parsed.pathname === '/v1/publish') {
			publishes.push(JSON.parse(init.body));
			return json({ ok: true });
		}
		return mock.fetchImpl(url, init);
	};
	return { mock, fetchImpl, publishes };
}

function errorBody(error) {
	return {
		ok: false,
		...(error?.code ? { code: error.code } : {}),
		...(error?.profileUserId ? { profileUserId: error.profileUserId } : {}),
		message: error instanceof Error ? error.message : 'Request failed.',
	};
}

export async function runScenario(name, { env = {}, seed = fixtureWorld(), users = [{ id: INVITEE, email: INVITEE_EMAIL }] } = {}) {
	const baas = backend(seed, users);
	const verifySession = (userId) => ({ userId });
	const workspace = createWorkspaceInvitesHandler({ config: CONFIG, verifySession, fetchImpl: baas.fetchImpl, env });
	const collab = createCollabHandler({ config: CONFIG, verifySession, fetchImpl: baas.fetchImpl, env });
	const deps = { fetchImpl: baas.fetchImpl, env, verifySession };
	const reply = response();
	let result;
	if (name === 'invitePerson') {
		await workspace(new URL(`http://bridge.test/api/workspaces/${PRIVATE_WS}/invites`), request({ email: INVITEE_EMAIL, role: 'guest' }), reply, CONFIG);
		result = reply.written;
	} else if (name === 'createInviteForUser') {
		try {
			const saved = await createInviteForUser({ deps, session: { userId: OWNER }, workspaceId: PRIVATE_WS, userId: INVITEE, role: 'guest', config: CONFIG });
			result = { status: 200, text: JSON.stringify(saved) };
		} catch (error) {
			result = { status: error?.status ?? 500, text: JSON.stringify(errorBody(error)) };
		}
	} else if (name === 'inviteMember') {
		await collab(new URL(`http://bridge.test/api/collaboration/${PRIVATE_WS}/invite`), request({ userId: INVITEE }), reply, CONFIG);
		result = reply.written;
	} else if (name === 'resendInvite') {
		await workspace(new URL(`http://bridge.test/api/workspaces/${PRIVATE_WS}/invites/${RESEND_INVITE}/resend`), request(undefined), reply, CONFIG);
		result = reply.written;
	} else if (name === 'acceptInvite') {
		await workspace(new URL('http://bridge.test/api/invites/accept'), request({ token: TOKEN }, 'POST', INVITEE), reply, CONFIG);
		result = reply.written;
	} else if (name === 'joinCollaboration') {
		await collab(new URL(`http://bridge.test/api/collaboration/${PUBLIC_WS}/join`), request({}, 'POST', INVITEE), reply, CONFIG);
		result = reply.written;
	} else if (name === 'approveJoinRequest') {
		await collab(new URL(`http://bridge.test/api/join-requests/${JOIN_REQUEST}`), request({ action: 'approve' }, 'PATCH'), reply, CONFIG);
		result = reply.written;
	} else {
		throw new Error(`unknown scenario ${name}`);
	}
	return { name, ...result, mock: baas.mock, publishes: baas.publishes };
}

export const BASELINE_SCENARIOS = [
	'invitePerson',
	'createInviteForUser',
	'inviteMember',
	'resendInvite',
	'acceptInvite',
	'joinCollaboration',
	'approveJoinRequest',
];

const DYNAMIC_FIELDS = new Set([
	'acceptedAt', 'accepted_at', 'createdAt', 'created_at', 'decided_at', 'expiresAt', 'expires_at', 'updatedAt', 'updated_at',
]);

function stable(value, key = '') {
	if (DYNAMIC_FIELDS.has(key)) return '<timestamp>';
	if (key === 'token') return '<token>';
	if (key === 'token_hash') return '<token-hash>';
	if (key === 'acceptUrl') return '<accept-url>';
	if (key === 'id' || key === 'inviteId') return '<invite-id>';
	if (Array.isArray(value)) return value.map((entry) => stable(entry));
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, stable(child, childKey)]));
	}
	if (typeof value === 'string') return value.replace(/(token_hash=eq\.)[0-9a-f]{64}/, '$1<token-hash>');
	return value;
}

export function baselineEntry(result) {
	return {
		name: result.name,
		status: result.status,
		body: JSON.stringify(stable(JSON.parse(result.text))),
		calls: stable(result.mock.calls.map((call) => ({
			method: call.method,
			path: `${call.table}${call.params.size ? `?${call.params}` : ''}`,
			body: call.body ?? null,
		}))),
	};
}

export async function recordBaseline(env = {}) {
	const entries = [];
	for (const name of BASELINE_SCENARIOS) entries.push(baselineEntry(await runScenario(name, { env })));
	return entries;
}
