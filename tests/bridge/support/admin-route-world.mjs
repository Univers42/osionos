/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   admin-route-world.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The account handler alone, over the keyset store, with the admin-role fixtures the admin
 * routes share: the four role ids, a seeded grant list, and a real app session per user.
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createUserSession, validateBridgePayload, verifyAppSessionToken } from '../../../scripts/bridge-api.mjs';
import { createAccountHandler } from '../../../scripts/bridge-account-mounts.mjs';
import { createPg } from '../../../scripts/bridge-pg.mjs';
import { ACCOUNT_JWT_SECRET, USER_A, accountConfig, send } from './account-world.mjs';
import { createKeysetStore } from './keyset-postgrest.mjs';
import { kvStub } from './kv-stub.mjs';

export const ROLE_IDS = {
	admin: '11111111-0000-4000-8000-000000000001',
	moderator: '11111111-0000-4000-8000-000000000002',
	user: '11111111-0000-4000-8000-000000000003',
	guest: '11111111-0000-4000-8000-000000000004',
};

export function roleTables(grants = [{ userId: USER_A, role: 'admin' }]) {
	return {
		roles: Object.entries(ROLE_IDS).map(([name, id]) => ({ id, name })),
		user_roles: grants.map(({ userId, role }) => ({ user_id: userId, role_id: ROLE_IDS[role], expires_at: null })),
	};
}

/** A real app session; `claim` is the is_admin flag the token carries, which the routes must ignore. */
export function tokenFor(config, userId = USER_A, claim = false) {
	const payload = validateBridgePayload({ provider: 'prismatica', subject: userId, email: 'member@example.com', name: 'Member', jti: randomUUID() });
	const persisted = { workspaceId: '0a4d1c2e-0000-4000-8000-000000000ad1', workspaceName: 'Home', workspaceSlug: 'home' };
	return createUserSession(payload, config, persisted, Date.now(), [], claim).session.accessToken;
}

export async function startAdminWorld(t, { path, tables, refuse = [], failReads, kv = kvStub() }) {
	const config = accountConfig();
	const store = createKeysetStore({ tables, refuse, failReads });
	const pg = createPg({ config, env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl: store.fetchImpl });
	const handler = createAccountHandler({ config, pg, kv, verifySession: verifyAppSessionToken, env: { JWT_SECRET: ACCOUNT_JWT_SECRET } });
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
		try {
			if (await handler(url, request, response)) return;
			response.writeHead(404).end('{}');
		} catch (error) {
			const retry = Number.isFinite(error?.retryAfterSeconds) ? { 'retry-after': String(error.retryAfterSeconds) } : {};
			response.writeHead(error?.status ?? 500, { 'content-type': 'application/json', ...retry });
			response.end(JSON.stringify({ ok: false, message: error?.message, code: error?.code }));
		}
	});
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t.after(() => new Promise((done) => server.close(done)));
	const base = `http://127.0.0.1:${server.address().port}`;
	const admin = tokenFor(config, USER_A);
	return { store, config, kv, base, admin, call: (query = '', options = {}) => send(base, `${path}${query}`, { token: admin, ...options }) };
}
