/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-world.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The world of the account plane: the bridge with the account modules mounted, the
 * PostgREST behind it and the app session of a caller. Two mounts live here — the whole
 * bridge (which proves the route reaches this module and not the generic 404) and the
 * account handler alone (which is where a route is exercised in isolation).
 *
 * The OTP service (grobase's login-OTP and GoTrue's admin route) is a third transport:
 * it is NOT the PostgREST, so it has its own fetch, and the account modules take it
 * apart from the database one.
 */

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { configFromEnv, createBridgeServer, createUserSession, validateBridgePayload, verifyAppSessionToken } from '../../../scripts/bridge-api.mjs';
import { createAccountHandler } from '../../../scripts/bridge-account-mounts.mjs';
import { createPg } from '../../../scripts/bridge-pg.mjs';
import { createAccountStore } from './account-postgrest.mjs';
import { createOtpService } from './account-otp.mjs';
import { kvStub } from './kv-stub.mjs';

export const ACCOUNT_JWT_SECRET = 'account-jwt-test-secret';
export const USER_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
export const USER_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const HOME_WORKSPACE = '0a4d1c2e-0000-4000-8000-000000000ad1';

/** The bridge configuration the account plane needs: a BaaS URL, a service key and a token key. */
export function accountConfig() {
	return configFromEnv({
		OSIONOS_SESSION_CUTOFFS: 'off',
		OSIONOS_SESSION_RECORDS: 'off',
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BAAS_URL: 'http://baas.local',
		KONG_SERVICE_API_KEY: 'service-role-test-key',
		KONG_PUBLIC_API_KEY: 'tenant-test-key',
	});
}

/** A real app session token, signed the way the bridge signs one. */
export function sessionToken(config, userId = USER_A) {
	return createUserSession(payloadFor(userId), config, { workspaceId: HOME_WORKSPACE, workspaceName: 'Home', workspaceSlug: 'home' }, Date.now(), []).session.accessToken;
}

function payloadFor(userId) {
	return validateBridgePayload({ provider: 'prismatica', subject: userId, email: 'member@example.com', name: 'Member', jti: randomUUID() });
}

/**
 * A session token whose jti already carries a sudo grant in the shared store. The
 * session id is the one the bridge minted (the payload's jti is not the token's), so
 * the grant is keyed by the same id the bridge will read.
 */
export async function sudoToken(config, kv, userId = USER_A) {
	const created = createUserSession(payloadFor(userId), config, { workspaceId: HOME_WORKSPACE, workspaceName: 'Home', workspaceSlug: 'home' }, Date.now(), []);
	await kv.set(`sudo:${created.sessionId}`, userId, 600_000);
	return created.session.accessToken;
}

/** The account client every world builds: the bridge's own transport, with the account key. */
function accountPg(config, store) {
	return createPg({ config, env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl: store.fetchImpl });
}

/** The account handler alone, on its own server: the routes without the rest of the bridge. */
export async function startAccountWorld(t, { rows = {}, kv, config = accountConfig(), fail = null, otp = createOtpService(), env = { JWT_SECRET: ACCOUNT_JWT_SECRET }, now = null } = {}) {
	const store = createAccountStore({ ...rows, fail });
	const pg = accountPg(config, store);
	const handler = createAccountHandler({ config, pg, kv: kv ?? kvStub(), verifySession: verifyAppSessionToken, env, fetchImpl: otp.fetchImpl, now });
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
		try {
			if (await handler(url, request, response)) return;
		} catch (error) {
			if (!response.headersSent) {
				response.writeHead(error?.status ?? 500, { 'content-type': 'application/json' });
				response.end(JSON.stringify({ ok: false, message: 'Account request failed.' }));
			}
			return;
		}
		response.writeHead(404, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ ok: false, message: 'Not found.' }));
	});
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t?.after(() => new Promise((done) => server.close(done)));
	return { base: `http://127.0.0.1:${server.address().port}`, store, config, pg, otp };
}

/** The whole bridge, with the account modules mounted: the route has to reach them. */
export async function startBridgeWorld(t, { rows = {}, kv, config = accountConfig(), fail = null, otp = null, env = null } = {}) {
	const store = createAccountStore({ ...rows, fail });
	// The whole bridge builds its own account handler, so the OTP transport and the
	// secret have to reach it the only way they can: the process environment and the
	// global fetch.
	if (env) {
		const before = process.env.JWT_SECRET;
		if (env.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
		else process.env.JWT_SECRET = env.JWT_SECRET;
		t?.after(() => {
			if (before === undefined) delete process.env.JWT_SECRET;
			else process.env.JWT_SECRET = before;
		});
	}
	if (otp) {
		const original = globalThis.fetch;
		globalThis.fetch = (url, init) => {
			const path = String(url);
			if (path.includes('/v1/auth/otp/') || path.includes('/auth/v1/admin/users/')) return otp.fetchImpl(url, init);
			return original(url, init);
		};
		t?.after(() => { globalThis.fetch = original; });
	}
	const server = createBridgeServer({
		config,
		fetchImpl: store.fetchImpl,
		pg: accountPg(config, store),
		kv: kv ?? kvStub(),
		env: { JWT_SECRET: ACCOUNT_JWT_SECRET },
	});
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t?.after(() => new Promise((done) => server.close(done)));
	return { base: `http://127.0.0.1:${server.address().port}`, store, config };
}

/** One call against a running bridge: the status, the raw text and the parsed body. */
export async function send(base, path, { method = 'GET', headers = {}, body, token } = {}) {
	const response = await fetch(`${base}${path}`, {
		method,
		headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	return { status: response.status, text, body: text ? JSON.parse(text) : null, headers: response.headers };
}
