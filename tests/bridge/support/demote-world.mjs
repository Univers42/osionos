/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   demote-world.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The admin demotion (osionos#343) over the account handler alone: two flagged admins (USER_A
 * calls, USER_B is demoted), their grants and admin-workspace memberships, a GoTrue directory
 * that answers each user's primary address, and the seal keys a secondary address opens with.
 * Every address and id here is synthetic.
 */

import { ADMIN_WORKSPACE_ID } from '../../../scripts/bridge-admin-rights.mjs';
import { createEmailRows } from '../../../scripts/bridge-account-email-rows.mjs';
import { ACCOUNT_JWT_SECRET, USER_A, USER_B, accountConfig, send } from './account-world.mjs';
import { ROLE_IDS, roleTables, startAdminWorld, sudoAdminToken } from './admin-route-world.mjs';

export const USER_C = 'cccccccc-3333-4333-8333-cccccccccccc';
export const OTHER_WORKSPACE = 'dddddddd-4444-4444-8444-dddddddddddd';
export const IDENTITIES = 'osionos_bridge_identities';
export const MEMBERS = 'osionos_workspace_members';
export const AUDIT = 'osionos_bridge_audit_events';
export const CUTOFFS = 'auth_session_cutoffs';
export const ENV_ADMIN = 'boss@example.test';
export const DEMOTE_ENV = {
	JWT_SECRET: ACCOUNT_JWT_SECRET,
	OSIONOS_EMAIL_SEAL_KEY: Buffer.alloc(32, 9).toString('base64'),
	OSIONOS_EMAIL_LOOKUP_KEY: 'k'.repeat(40),
};
const GOTRUE_USERS = '/auth/v1/admin/users/';
const PAST = '2026-01-01T00:00:00.000Z';

const identity = (provider, subject, userId, isAdmin) => ({ provider, subject, user_id: userId, is_admin: isAdmin });
const member = (workspaceId, userId) => ({ workspace_id: workspaceId, user_id: userId, role: 'admin', permissions: ['read', 'update', 'admin'] });

/**
 * USER_B holds three flagged rows: by user_id and subject, by user_id only, and by subject only
 * (a row whose user_id is not the subject, U3). An expired admin grant and a user grant sit
 * beside the live one; a membership of another workspace sits beside the admin one.
 */
export function demoteTables() {
	const { roles, user_roles: grants } = roleTables([{ userId: USER_A, role: 'admin' }, { userId: USER_B, role: 'admin' }, { userId: USER_B, role: 'user' }]);
	grants.push({ user_id: USER_B, role_id: ROLE_IDS.admin, expires_at: PAST });
	return {
		roles,
		user_roles: grants,
		[IDENTITIES]: [
			identity('prismatica', USER_A, USER_A, true),
			identity('prismatica', USER_B, USER_B, true),
			identity('github', 'gh-target', USER_B, true),
			identity('legacy', USER_B, null, true),
			identity('prismatica', USER_C, USER_C, false),
		],
		[MEMBERS]: [member(ADMIN_WORKSPACE_ID, USER_A), member(ADMIN_WORKSPACE_ID, USER_B), member(OTHER_WORKSPACE, USER_B)],
		[AUDIT]: [],
		[CUTOFFS]: [],
		osionos_user_emails: [],
	};
}

export const defaultDirectory = () => new Map([[USER_A, { email: 'caller@example.test' }], [USER_B, { email: 'target@example.test' }], [USER_C, { email: 'plain@example.test' }]]);

/** GoTrue's admin read: the directory's entry, a 404 for an unknown id, `{ status }` for a fault. */
export function gotrue(directory) {
	return (storeFetch) => async (url, init) => {
		const { pathname } = new URL(String(url));
		if (!pathname.startsWith(GOTRUE_USERS)) return storeFetch(url, init);
		const entry = directory.get(pathname.slice(GOTRUE_USERS.length));
		if (!entry) return new Response('{"msg":"User not found"}', { status: 404 });
		if (entry.status) return new Response('{}', { status: entry.status });
		return new Response(JSON.stringify({ id: pathname.slice(GOTRUE_USERS.length), email: entry.email }), { status: 200, headers: { 'content-type': 'application/json' } });
	};
}

/** `wrap` sits between the route and the store, after the GoTrue fake: a fault or a race. */
export async function startDemoteWorld(t, { tables = demoteTables(), refuse = [], failReads, directory = defaultDirectory(), adminEmails = [ENV_ADMIN], wrap = (next) => next } = {}) {
	const config = accountConfig();
	config.adminEmails = adminEmails;
	const transport = (storeFetch) => wrap(gotrue(directory)(storeFetch));
	const world = await startAdminWorld(t, { path: '/api/account/admin/users', tables, refuse, failReads, transport, env: DEMOTE_ENV, config });
	const caller = await sudoAdminToken(config, world.kv, USER_A);
	const emails = createEmailRows({ pg: world.pg, env: DEMOTE_ENV });
	return {
		...world,
		directory,
		caller,
		demote: (target, token = caller) => send(world.base, `/api/account/admin/users/${target}/demote`, { method: 'POST', token }),
		/** Seeds a secondary address and forgets the seeding call, so `writes()` counts the route's only. */
		async addSecondary(userId, address, verifiedAt = PAST) {
			await (verifiedAt ? emails.insertVerified(userId, address, verifiedAt) : emails.insert(userId, address));
			world.store.calls.length = 0;
		},
		writes: () => world.store.calls.filter((call) => call.method !== 'GET'),
	};
}

export const flagged = (store, userId) => store.rows(IDENTITIES).filter((row) => (row.user_id === userId || row.subject === userId) && row.is_admin === true);
export const adminGrants = (store, userId) => store.rows('user_roles').filter((row) => row.user_id === userId && row.role_id === ROLE_IDS.admin);
export const adminMembership = (store, userId) => store.rows(MEMBERS).filter((row) => row.user_id === userId && row.workspace_id === ADMIN_WORKSPACE_ID);
