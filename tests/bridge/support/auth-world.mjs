/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   auth-world.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A bridge server in front of scripted neighbours: the auth gateway, GoTrue's /auth/v1/user and
// Cloudflare's siteverify. Every call each neighbour saw is kept, and so are the rows the bridge
// wrote (sessions, audit), so a test can say "the gateway was never called" or "no row holds the token".
// Caveat: the three neighbours are stubs; GoTrue's real claim set (amr) is what the exchange tests
// build by hand, and was read from the pinned image's binary, not from a running GoTrue.

import { randomUUID } from 'node:crypto';
import { configFromEnv, createBridgeHandoff, createBridgeServer, validateBridgePayload } from '../../../scripts/bridge-api.mjs';
import { kvStub } from './kv-stub.mjs';
import { noFactorPg } from './no-factor-pg.mjs';

export const GATEWAY = 'https://gateway.local';
export const BAAS = 'https://baas.local';
export const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const SECRET = 'turnstile-secret-that-must-never-leak';
export const USER_ID = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
export const EMAIL = 'ada@example.com';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** An unsigned GoTrue-shaped JWT: the bridge learns the signature is good from GoTrue, not from the bytes. */
export function gotrueJwt(claims = {}) {
	const { sub = USER_ID, iat = nowSeconds(), extra = {} } = claims;
	// `amr: undefined` must mean "no claim", which a default parameter would swallow.
	const amr = 'amr' in claims ? claims.amr : [{ method: 'otp', timestamp: iat }];
	const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
	return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub, iat, exp: iat + 3600, amr, ...extra })}.c2lnbmF0dXJl`;
}

export function authEnv(extra = {}) {
	return {
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
		OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
		OSIONOS_BAAS_URL: BAAS,
		KONG_SERVICE_API_KEY: 'service-role-test-key',
		PUBLIC_BAAS_ANON_KEY: 'public-anon-test-key',
		AUTH_GATEWAY_URL: GATEWAY,
		...extra,
	};
}

/**
 * options.env       env overrides (TURNSTILE_*, ...)
 * options.gotrue    (token) => Response for GET /auth/v1/user; default: accepts any token for USER_ID
 * options.gateway   ({ route, body, headers }) => Response | undefined; undefined falls back to the default gateway script
 * options.siteverify (form) => Response | throws, for Cloudflare
 */
export async function startAuthWorld(t, options = {}) {
	const config = { ...configFromEnv(authEnv(options.env)) };
	const kv = kvStub();
	const calls = { gateway: [], gotrue: [], siteverify: [] };
	const rows = { sessions: [], audit: [] };
	const subject = options.subject ?? USER_ID;
	const fetchImpl = async (url, init = {}) => {
		const target = String(url);
		if (target === SITEVERIFY) {
			const form = Object.fromEntries(new URLSearchParams(String(init.body)));
			calls.siteverify.push(form);
			return options.siteverify ? options.siteverify(form) : reply({ success: true });
		}
		if (target === `${BAAS}/auth/v1/user`) {
			const token = String(init.headers?.Authorization ?? '').replace(/^Bearer /, '');
			calls.gotrue.push({ token, headers: init.headers });
			return options.gotrue ? options.gotrue(token) : reply({ id: USER_ID, email: EMAIL });
		}
		if (target.startsWith(GATEWAY)) {
			const route = target.slice(GATEWAY.length);
			const body = init.body ? JSON.parse(init.body) : {};
			calls.gateway.push({ route, body, headers: init.headers });
			const scripted = options.gateway?.({ route, body, headers: init.headers });
			if (scripted) return scripted;
			if (route === '/api/auth/register') return reply({ ok: true });
			if (route === '/api/auth/login') return reply({ access_token: 'gw-token', refresh_token: 'gw-refresh', user: { id: subject } });
			const handoff = await createBridgeHandoff({
				payload: validateBridgePayload({ provider: 'prismatica', subject, email: EMAIL, name: 'Ada', jti: randomUUID() }),
				config, kv, pg: noFactorPg(),
			});
			return reply({ redirectUrl: handoff.redirectUrl });
		}
		throw new Error(`unscripted fetch ${target}`);
	};
	const pg = {
		asService: () => ({
			post: async (table, row) => {
				if (options.failAudit && table !== 'osionos_sessions') throw new Error('audit table unreachable');
				rows[table === 'osionos_sessions' ? 'sessions' : 'audit'].push({ table, ...row });
				return null;
			},
		}),
	};
	const server = createBridgeServer({ config, kv, fetchImpl, pg });
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t.after(() => new Promise((done) => server.close(done)));
	const base = `http://127.0.0.1:${server.address().port}`;
	const post = async (path, body, headers = {}) => {
		const response = await fetch(`${base}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: typeof body === 'string' ? body : JSON.stringify(body),
		});
		const text = await response.text();
		return { status: response.status, headers: response.headers, text, body: text ? JSON.parse(text) : null };
	};
	return { base, calls, rows, post, config, kv };
}
