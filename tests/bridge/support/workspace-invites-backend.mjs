/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-invites-backend.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The world the workspace-invite tests share: one team workspace, a GoTrue admin list that
// matches like the real filter (containment), and a recorder for realtime publishes.

import { IDS, createPostgrestMock, harnessConfig, sessionHeaders } from './bridge-harness.mjs';

export const config = harnessConfig();
export const OWNER = IDS.userA;
export const INVITEE = IDS.userB;
export const ADMIN = 'cccccccc-3333-4333-8333-cccccccccccc';
export const STRANGER = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
export const OWNER_EMAIL = 'alice@example.com';
export const INVITEE_EMAIL = 'bob@example.com';
export const ALL_PERMISSIONS = ['create', 'read', 'update', 'delete', 'admin'];
export const asOwner = sessionHeaders(config, OWNER, IDS.homeA);
export const asInvitee = sessionHeaders(config, INVITEE, IDS.homeB);
export const asAdmin = sessionHeaders(config, ADMIN, 'c1c1c1c1-3333-4333-8333-c1c1c1c1c1c1');
export const asStranger = sessionHeaders(config, STRANGER, 'e1e1e1e1-5555-4555-8555-e1e1e1e1e1e1');
export const invitePath = `/api/workspaces/${IDS.team}/invites`;
export const writes = (mock) => mock.calls.filter((call) => call.method !== 'GET');

function json(value, status = 200) {
	return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
}

export function world({ owner = OWNER, members = [], invites = [], ...extra } = {}) {
	return {
		osionos_workspaces: [{ id: IDS.team, owner_id: owner, name: 'Team', slug: 'team', visibility: 'confidential' }],
		osionos_workspace_members: members,
		osionos_workspace_invites: invites,
		osionos_people_directory: [
			{ user_id: OWNER, display_name: 'Alice', profile: { avatar: 'alice.png' } },
			{ user_id: INVITEE, display_name: 'Bob', profile: { avatar: 'bob.png' } },
		],
		...extra,
	};
}

/** PostgREST harness + a GoTrue admin list + a publish recorder. */
export function backend({ seed = world(), users = [{ id: INVITEE, email: INVITEE_EMAIL, user_metadata: { full_name: 'Bob' } }], lookupStatus = 200 } = {}) {
	const mock = createPostgrestMock(seed);
	const publishes = [];
	const authCalls = [];
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		if (parsed.pathname === '/auth/v1/admin/users') {
			const filter = String(parsed.searchParams.get('filter') ?? '').toLowerCase();
			authCalls.push(filter);
			if (lookupStatus !== 200) return json({ message: 'identity store unavailable' }, lookupStatus);
			return json({ users: users.filter((user) => String(user.email).toLowerCase().includes(filter)) });
		}
		if (parsed.pathname === '/v1/publish') {
			publishes.push(JSON.parse(init.body));
			return json({ ok: true });
		}
		return mock.fetchImpl(url, init);
	};
	return { ...mock, fetchImpl, publishes, authCalls };
}
