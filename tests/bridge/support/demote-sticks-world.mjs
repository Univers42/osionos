/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   demote-sticks-world.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The whole bridge around a demotion (osionos#343, D343-10/11/12): sign-in and refresh write the
 * grant and the admin-workspace membership the flag implies, the session cut-offs are ENFORCED
 * (the demotion's sign-out means nothing with them off, D343-16), and USER_A demotes USER_B.
 *
 * One fetch serves it all: GoTrue's admin read, the identity rows (filtered for real, both keys,
 * so the demote PATCH and the writers' re-read hit the same rows sign-in reads), the session,
 * audit and cut-off rows, and the sign-in stub for the rest. `hold(call)` may return a promise a
 * request waits on before it is answered: that is how a racing refresh or sign-in is parked
 * between its flag read and its write. Every address and id is synthetic.
 */

import { ADMIN_WORKSPACE_ID } from '../../../scripts/bridge-admin-rights.mjs';
import { createBridgeServer } from '../../../scripts/bridge-api.mjs';
import { SessionCutoffs } from '../../../scripts/bridge-session-cutoff.mjs';
import { ROLE_IDS, roleTables, sudoAdminToken } from './admin-route-world.mjs';
import { DEMOTE_ENV, gotrue } from './demote-world.mjs';
import { kvStub } from './kv-stub.mjs';
import { createSessionStore, matches } from './session-postgrest.mjs';
import { USER_A, USER_B, sendJson } from './session-world.mjs';
import { createSigninStub, hashOf, signinConfig, workspaceRow } from './signin-world.mjs';

export const PRIVATE_B = 'b0b0b0b0-5555-4555-8555-b0b0b0b0b0b0';
const PRIVATE_A = 'a0a0a0a0-6666-4666-8666-a0a0a0a0a0a0';
const IDENTITIES = 'osionos_bridge_identities';
const SESSION_TABLES = new Set(['osionos_sessions', 'osionos_bridge_audit_events', 'auth_session_cutoffs']);
const PAGING_KEYS = new Set(['select', 'order', 'limit', 'on_conflict']);
const quietLog = { info() {}, warn() {} };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const identity = (subject, workspaceId) => ({
	provider: 'prismatica', subject, user_id: subject, email_hash: hashOf('member@example.com'), is_admin: true, workspace_id: workspaceId,
});

function seed() {
	const { roles, user_roles: grants } = roleTables([{ userId: USER_A, role: 'admin' }]);
	return {
		identities: [identity(USER_A, PRIVATE_A), identity(USER_B, PRIVATE_B)],
		roles,
		user_roles: grants,
		osionos_workspaces: [
			workspaceRow(PRIVATE_A, USER_A, 'HomeA', '2026-10-01T00:00:00.000Z'),
			workspaceRow(PRIVATE_B, USER_B, 'HomeB', '2026-10-02T00:00:00.000Z'),
			workspaceRow(ADMIN_WORKSPACE_ID, USER_A, 'Admin', '2026-10-03T00:00:00.000Z'),
		],
		osionos_workspace_members: [
			{ workspace_id: PRIVATE_A, user_id: USER_A, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] },
			{ workspace_id: PRIVATE_B, user_id: USER_B, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] },
			{ workspace_id: ADMIN_WORKSPACE_ID, user_id: USER_A, role: 'admin', permissions: ['read', 'update', 'admin'] },
		],
	};
}

/** The identity rows with the filters applied: GET projects, PATCH updates every row it matches. */
function identityRoute(rows, method, params, body) {
	const filters = [...params].filter(([key]) => !PAGING_KEYS.has(key));
	const hits = rows.filter((row) => filters.every(([key, expr]) => matches(row, key, expr)));
	if (method === 'PATCH') {
		for (const row of hits) Object.assign(row, body);
		return new Response(null, { status: 204 });
	}
	const columns = params.get('select')?.split(',');
	return json(hits.map((row) => (columns ? Object.fromEntries(columns.map((key) => [key, row[key] ?? null])) : { ...row })));
}

function composeFetch({ stub, sessions, hold }) {
	return async (url, init = {}) => {
		const parsed = new URL(String(url));
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		await hold.current?.({ table, method, body: init.body ? JSON.parse(init.body) : undefined });
		if (table === IDENTITIES) return identityRoute(stub.identityRows, method, parsed.searchParams, init.body ? JSON.parse(init.body) : undefined);
		if (SESSION_TABLES.has(table)) return sessions.fetchImpl(url, init);
		return stub.fetchImpl(url, init);
	};
}

async function untilFresh(tracker) {
	for (let attempt = 0; attempt < 400; attempt += 1) {
		if (tracker.status() === 'fresh') return;
		await new Promise((done) => setTimeout(done, 5));
	}
	throw new Error('the cut-off tracker never loaded its table');
}

export async function startSticksWorld(t) {
	const stub = createSigninStub(seed());
	const sessions = createSessionStore();
	const hold = { current: null };
	const directory = new Map([[USER_A, { email: 'caller@example.test' }], [USER_B, { email: 'target@example.test' }]]);
	const fetchImpl = gotrue(directory)(composeFetch({ stub, sessions, hold }));
	const config = signinConfig({ OSIONOS_AGENT_CLAUDE: '1' });
	config.sessionCutoffs = new SessionCutoffs({ enforced: true, now: () => Date.now(), log: quietLog });
	const kv = kvStub();
	const spawnImpl = () => { throw new Error('the Claude agent must not spawn in this suite'); };
	const server = createBridgeServer({ config, fetchImpl, kv, env: DEMOTE_ENV, spawnImpl, moderationRetract: false, sessionCutoffLog: quietLog });
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t.after(() => new Promise((done) => server.close(done)));
	await untilFresh(server.sessionCutoffs);
	const base = `http://127.0.0.1:${server.address().port}`;
	const caller = await sudoAdminToken(config, kv, USER_A);
	return {
		base,
		stub,
		sessions,
		hold,
		demote: () => sendJson(base, `/api/account/admin/users/${USER_B}/demote`, { method: 'POST', headers: { authorization: `Bearer ${caller}` } }),
		adminGrants: () => stub.mock.rows('user_roles').filter((row) => row.user_id === USER_B && row.role_id === ROLE_IDS.admin),
		adminMembership: () => stub.mock.rows('osionos_workspace_members').filter((row) => row.user_id === USER_B && row.workspace_id === ADMIN_WORKSPACE_ID),
		flagged: () => stub.identityRows.filter((row) => row.user_id === USER_B && row.is_admin === true),
	};
}

/**
 * Parks the first request `match` accepts until `release()`; `reached` settles when it arrives.
 * Every later request passes straight through.
 */
export function parkFirst(world, match) {
	let release = null;
	let arrived = null;
	const reached = new Promise((done) => { arrived = done; });
	const released = new Promise((done) => { release = done; });
	world.hold.current = (call) => {
		if (!match(call)) return undefined;
		world.hold.current = null;
		arrived();
		return released;
	};
	return { reached, release: () => release() };
}
