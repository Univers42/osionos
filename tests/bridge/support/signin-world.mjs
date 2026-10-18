/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   signin-world.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A BaaS for the sign-in tests: the identity upsert (it rewrites email_hash, as the SQL does),
// the is_admin read/promotion on osionos_bridge_identities, the members upsert keyed on
// (workspace_id, user_id), and osionos_bridge_list_workspaces as the plain JOIN the migration
// defines (members of p_user_id, restricted to p_workspace_ids, newest updated_at first).
// Everything else (member reads, embeds) goes to the strict harness stub, so a sign-in query
// shape it does not know still fails the test. Every request is logged in arrival order.
// Caveat: `persistCommitsAfterReads` makes the upsert wait 15 ms before it commits the hash, so a
// read issued in the same tick sees the OLD hash; sequential code is slowed by 15 ms, never
// changed. Emails are matched by hash equality, so a different hash is a different email.

import { createHmac, randomUUID } from 'node:crypto';
import { configFromEnv, consumeHandoffToken, createBridgeHandoff, validateBridgePayload, verifyAppSessionToken } from '../../../scripts/bridge-api.mjs';
import { createPostgrestMock } from './bridge-harness.mjs';

export const BAAS_URL = 'http://baas.local';
export const SUBJECT = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
export const PRIVATE_ID = 'ac47a462-a784-49cb-aa8d-c87a7251be1e';
export const NOW = 1_768_000_000_000;
const SALT = 'test-bridge-secret-that-is-long-enough';
const same = (left, right) => left != null && String(left).toLowerCase() === String(right).toLowerCase();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const hashOf = (email) => createHmac('sha256', SALT).update(email).digest('hex');

export function signinConfig(extra = {}) {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: SALT,
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BAAS_URL: BAAS_URL,
		KONG_SERVICE_API_KEY: 'service-role-test-key',
		OSIONOS_BRIDGE_PERSISTENCE: 'baas',
		OSIONOS_ADMIN_EMAILS: 'boss@example.com',
		...extra,
	});
}

export function workspaceRow(id, ownerId, name, updatedAt, extra = {}) {
	return {
		id, owner_id: ownerId, name, slug: name.toLowerCase(), settings: { plan: 'Team' },
		created_at: '2026-09-01T00:00:00.000Z', updated_at: updatedAt, ...extra,
	};
}

/** The classes of request a sign-in makes, by what they do. */
export function kindOf(entry) {
	const path = entry.name;
	if (path === 'rpc/osionos_bridge_upsert_workspace') return 'persist';
	if (path === 'rpc/osionos_bridge_list_workspaces') return 'rpc-list';
	if (path === 'osionos_bridge_identities') return entry.method === 'PATCH' ? 'patch-admin' : 'get-admin';
	if (path === 'osionos_workspace_members') {
		if (entry.method === 'POST') return 'ensure';
		if (entry.params.get('select')?.includes('(')) return 'embed';
		return 'members-ids';
	}
	return `other:${entry.method} ${path}`;
}

/**
 * seed: { identities: [{ provider, subject, email_hash, is_admin, workspace_id }], osionos_workspaces, osionos_workspace_members }.
 * options.persistCommitsAfterReads delays the hash commit of the upsert; options.hold(entry) may return
 * a promise the request waits for before it is answered; options.fail(entry) may return a Response.
 */
export function createSigninStub(seed = {}, options = {}) {
	const { identities = [], ...tables } = seed;
	const mock = createPostgrestMock(tables);
	const identityRows = identities.map((row) => structuredClone(row));
	const log = [];
	const members = () => mock.rows('osionos_workspace_members');
	const workspaces = () => mock.rows('osionos_workspaces');

	async function persist(body) {
		if (options.persistCommitsAfterReads) await new Promise((resolve) => setTimeout(resolve, 15));
		let identity = identityRows.find((row) => row.provider === body.p_provider && row.subject === body.p_subject);
		if (!identity) {
			identity = { provider: body.p_provider, subject: body.p_subject, is_admin: false, workspace_id: options.privateId ?? PRIVATE_ID };
			identityRows.push(identity);
			workspaces().push(workspaceRow(identity.workspace_id, body.p_subject, 'Home', '2026-10-01T00:00:00.000Z'));
			members().push({ workspace_id: identity.workspace_id, user_id: body.p_subject, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] });
		}
		identity.email_hash = body.p_email_hash;
		return json([{ workspace_id: identity.workspace_id, workspace_name: "Owner's osionos", workspace_slug: 'owner-osionos' }]);
	}

	function identities_(entry) {
		const hash = entry.params.get('email_hash')?.replace(/^eq\./, '');
		const hit = identityRows.filter((row) => row.email_hash === hash);
		if (entry.method === 'PATCH') {
			for (const row of hit.filter((candidate) => candidate.is_admin === false)) Object.assign(row, entry.body);
			return new Response(null, { status: 204 });
		}
		return json(hit.slice(0, 1).map((row) => ({ is_admin: row.is_admin })));
	}

	function ensure(body) {
		const existing = members().find((row) => same(row.workspace_id, body.workspace_id) && same(row.user_id, body.user_id));
		if (existing) Object.assign(existing, body);
		else members().push({ ...body });
		return new Response(null, { status: 204 });
	}

	function listWorkspaces(body) {
		const wanted = body.p_workspace_ids ?? [];
		return members()
			.filter((member) => same(member.user_id, body.p_user_id) && wanted.some((id) => same(id, member.workspace_id)))
			.map((member) => ({ member, workspace: workspaces().find((row) => same(row.id, member.workspace_id)) }))
			.filter(({ workspace }) => workspace !== undefined)
			.sort((left, right) => Date.parse(right.workspace.updated_at) - Date.parse(left.workspace.updated_at))
			.map(({ member, workspace }) => ({
				workspace_id: workspace.id, owner_id: workspace.owner_id, workspace_name: workspace.name, workspace_slug: workspace.slug,
				workspace_settings: workspace.settings, created_at: workspace.created_at, updated_at: workspace.updated_at,
				workspace_role: member.role, permissions: member.permissions,
			}));
	}

	async function fetchImpl(url, init = {}) {
		const parsed = new URL(String(url));
		const method = init.method ?? 'GET';
		const entry = { method, name: parsed.pathname.replace('/rest/v1/', ''), params: parsed.searchParams, query: parsed.search, body: init.body ? JSON.parse(init.body) : undefined };
		log.push(entry);
		entry.kind = kindOf(entry);
		if (options.hold) await options.hold(entry);
		const failure = options.fail?.(entry);
		if (failure) return failure;
		if (entry.kind === 'persist') return persist(entry.body);
		if (entry.name === 'osionos_bridge_identities') return identities_(entry);
		if (entry.kind === 'ensure') return ensure(entry.body);
		if (entry.kind === 'rpc-list') return json(listWorkspaces(entry.body));
		return mock.fetchImpl(url, init);
	}

	return { fetchImpl, log, mock, identityRows, kinds: () => log.map((entry) => entry.kind) };
}

/** Sign in and return the decoded token claims, the session and the stub's request log. */
export async function signIn(stub, { email = 'owner@example.com', emailVerified = true, config = signinConfig(), subject = SUBJECT } = {}) {
	const payload = validateBridgePayload({ provider: 'prismatica', subject, email, emailVerified, name: 'Owner', jti: randomUUID() });
	const handoffStore = new Map();
	await createBridgeHandoff({ payload, config, handoffStore, now: NOW, fetchImpl: stub.fetchImpl });
	const [token] = handoffStore.keys();
	const { session } = consumeHandoffToken(token, handoffStore, NOW + 1000);
	return { session, claims: verifyAppSessionToken(session.accessToken, config, NOW + 1000) };
}
