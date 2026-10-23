/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pat-world.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The world of the personal access token middleware: a real bridge whose BaaS is two fakes
 * behind one fetch — the token, audit and session tables (pat-postgrest.mjs) and the page
 * tables (bridge-harness.mjs) — and a log of everything the bridge sent either of them, so a
 * test can say what a request header or a row never contained.
 */

import { randomUUID } from 'node:crypto';
import { createBridgeServer } from '../../../scripts/bridge-api.mjs';
import { createPatGate } from '../../../scripts/bridge-pat-middleware.mjs';
import { createPg } from '../../../scripts/bridge-pg.mjs';
import { mintPatSecret } from '../../../scripts/bridge-pat-store.mjs';
import { harnessConfig, createPostgrestMock, IDS } from './bridge-harness.mjs';
import { kvStub } from './kv-stub.mjs';
import { AUDIT_TABLE, createPatStore, PAT_TABLE } from './pat-postgrest.mjs';

export const OWNER = IDS.userA;
export const HOME = IDS.homeA;
export const PAGE = IDS.privateA;
export const JWT_SECRET = 'account-jwt-test-secret';
const PAT_SIDE = new Set([PAT_TABLE, AUDIT_TABLE, 'osionos_sessions']);

export const inDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString();

/** A stored token and the secret that opens it; the row carries only the hash. */
export function patRow({ kind = 'classic', scopes = ['pages:read'], grants = [], expiresAt = inDays(30), revokedAt = null, lastUsedAt = null, userId = OWNER } = {}) {
	const { secret, hash } = mintPatSecret();
	const row = {
		id: randomUUID(), user_id: userId, name: 'CI token', kind, scopes, grants, token_hash: hash,
		created_at: '2026-10-01T00:00:00.000Z', expires_at: expiresAt, last_used_at: lastUsedAt,
		revoked_at: revokedAt, revoked_reason: revokedAt ? 'user' : null,
	};
	return { secret, row };
}

export const fineGrained = (attributes, permissions = ['read']) => ({ kind: 'fine_grained', scopes: [], grants: [{ resource: 'pages', attributes, permissions }] });

function pageRow() {
	return {
		id: PAGE, workspace_id: HOME, owner_id: OWNER, visibility: 'private', title: 'Plan', icon: 'P',
		collaborators: [], properties: [], parent_page_id: null, archived_at: null,
		content: [{ id: 'b1', type: 'paragraph', content: 'the body' }],
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
	};
}

/** The owner's workspace, as the gate finds it (owner_id); no row means a user with nowhere to read. */
const workspace = { id: HOME, owner_id: OWNER, created_at: '2026-10-01T00:00:00.000Z' };

/** The identity row of the owner; `is_admin` proves a PAT never inherits it. */
const identity = (isAdmin) => ({ user_id: OWNER, is_admin: isAdmin });

export async function startPatWorld(t, { tokens = [], fail = null, hasIdentity = true, ownerIsAdmin = false, now, rateLimit, pageFail } = {}) {
	const config = harnessConfig();
	const patStore = createPatStore({ tokens, fail });
	const pages = createPostgrestMock({ osionos_pages: [pageRow()], osionos_workspaces: hasIdentity ? [workspace] : [], osionos_bridge_identities: [identity(ownerIsAdmin)] }, pageFail ? { failWhen: pageFail } : {});
	const seen = [];
	const fetchImpl = async (url, init = {}) => {
		const table = new URL(String(url)).pathname.replace('/rest/v1/', '');
		seen.push({ table, headers: { ...init.headers }, body: init.body ?? null });
		return (PAT_SIDE.has(table) ? patStore : pages).fetchImpl(url, init);
	};
	const kv = kvStub();
	const server = createBridgeServer({ config, fetchImpl, kv, env: { JWT_SECRET }, now, patRateLimit: rateLimit });
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t?.after(() => new Promise((done) => server.close(done)));
	/** A gate over this world's stores, its fetch optionally wrapped: how a test fails one table or feeds it a foreign row. */
	const gateWith = (wrap = (inner) => inner, options = {}) => {
		const wrapped = wrap(fetchImpl);
		const pg = createPg({ config, env: { JWT_SECRET }, fetchImpl: wrapped });
		return createPatGate({ pg, fetchImpl: wrapped, memberWorkspaceEntries: async () => [], kv, now, rateLimit, ...options });
	};
	return { base: `http://127.0.0.1:${server.address().port}`, config, patStore, pages, seen, kv, gate: gateWith(), gateWith };
}

/** The audit rows the bridge wrote, in order. */
export const auditRows = (world) => world.patStore.rows(AUDIT_TABLE);

/** Every byte the bridge sent a fake or wrote to a row, as one string: what a secret must not be in. */
export const everythingSent = (world) => JSON.stringify([world.seen, auditRows(world)]);

export const bearer = (secret) => ({ authorization: `Bearer ${secret}`, 'content-type': 'application/json' });

/** A request as the gate sees it, with the raw header list a proxy would also expose. */
export function fakeRequest(secret, { method = 'GET', path = `/api/pages/${PAGE}` } = {}) {
	return { method, url: path, headers: { authorization: `Bearer ${secret}`, host: 'bridge.test' }, rawHeaders: ['Authorization', `Bearer ${secret}`, 'Host', 'bridge.test'], socket: {} };
}

/** A response the gate can write to: it records the head and the body instead of sending them. */
export function fakeResponse() {
	const sent = { head: null, body: null };
	return {
		sent,
		headersSent: false,
		writeHead(status, headers) { sent.head = { status, headers }; return this; },
		write() { throw new Error('the fake response does not stream'); },
		end(body) { sent.body = body === undefined ? '' : String(body); },
	};
}
