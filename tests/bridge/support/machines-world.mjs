/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machines-world.mjs                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The world of the own-machines routes: the osionos_machines table behind a PostgREST that
// applies the owner policy and the one-default index, GoTrue's admin read of an address, a kv
// whose TTLs follow a clock the test moves, and a machine that signs like osionos-node does.
//
// The policy and the index are the point: a fake that let the account role read every row, or
// accepted two defaults, would pass the very bugs the devil's conditions name.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

import { createMachineRoutes } from '../../../scripts/bridge-machines.mjs';
import { createPg } from '../../../scripts/bridge-pg.mjs';
import { verifyAppSessionToken } from '../../../scripts/bridge-api.mjs';
import { b64url, generateAgentKeyPair, signMessage } from '../../../scripts/ide-agent-frames.mjs';
import { heartbeatMessage, pairPollMessage, pairStartMessage, whoamiMessage } from '../../../scripts/machine-protocol.mjs';
import { createTtlKv } from './account-kv.mjs';
import { ACCOUNT_JWT_SECRET, USER_A, USER_B, accountConfig, sessionToken, sudoToken } from './account-world.mjs';

export { USER_A, USER_B };
export const ORIGIN = 'https://bridge.test:10000';
export const IDE_ORIGIN = 'http://127.0.0.1:4100';
export const SEED = randomBytes(32).toString('base64url');
export const EMAILS = { [USER_A]: 'ada@example.com', [USER_B]: 'bob@example.com' };
const MACHINES = 'osionos_machines';
const AUDIT = 'osionos_bridge_audit_events';
const ACCOUNT_ROLE = 'osionos_account_user';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function claimsOf(headers) {
	const token = String(headers?.Authorization ?? '').replace(/^Bearer /, '');
	const payload = token.split('.')[1];
	if (!payload) return { service: true };
	return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

function matches(row, key, expr) {
	if (expr === 'is.null') return row[key] == null;
	if (expr.startsWith('eq.')) return String(row[key]) === expr.slice(3);
	throw new Error(`machines store: unsupported filter ${key}=${expr}`);
}

const RESERVED = new Set(['select', 'order', 'limit']);
const project = (row, select) => (select ? Object.fromEntries(select.split(',').map((key) => [key, row[key]])) : { ...row });

/** The table, its policy and its index. `fail` answers a call with an error status. */
export function createMachineStore({ rows = [], fail = null } = {}) {
	const tables = new Map([[MACHINES, rows.map((row) => ({ ...row }))], [AUDIT, []]]);
	const calls = [];
	const visible = (table, claims) => {
		if (claims.service) return tables.get(table);
		if (claims.aud !== 'osionos-account' || claims.role !== ACCOUNT_ROLE) return [];
		return tables.get(table).filter((row) => row.user_id === claims.sub);
	};
	const selected = (table, params, claims) => {
		const found = visible(table, claims).filter((row) => [...params].every(([key, expr]) => RESERVED.has(key) || matches(row, key, expr)));
		return found.slice(0, params.has('limit') ? Number(params.get('limit')) : found.length);
	};
	const twoDefaults = () => {
		const owners = tables.get(MACHINES).filter((row) => row.is_default).map((row) => row.user_id);
		return new Set(owners).size !== owners.length;
	};
	function patch(params, claims, body) {
		const hits = selected(MACHINES, params, claims);
		const before = hits.map((row) => ({ ...row }));
		hits.forEach((row) => Object.assign(row, body));
		if (!twoDefaults()) return json(hits.map((row) => project(row, params.get('select'))));
		hits.forEach((row, index) => Object.assign(row, before[index]));
		return json({ code: '23505', message: 'osionos_machines_one_default' }, 409);
	}
	function fetchImpl(url, init = {}) {
		const parsed = new URL(String(url));
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const claims = claimsOf(init.headers);
		const body = init.body ? JSON.parse(init.body) : undefined;
		calls.push({ method, table, params: parsed.searchParams, body, claims });
		const failure = fail?.({ method, table });
		if (failure) return Promise.resolve(json({ message: 'down' }, failure));
		if (!tables.has(table)) return Promise.resolve(json({ message: 'not served' }, 404));
		if (method === 'GET') return Promise.resolve(json(selected(table, parsed.searchParams, claims).map((row) => project(row, parsed.searchParams.get('select')))));
		if (method === 'POST' && claims.service) {
			tables.get(table).push({ created_at: new Date().toISOString(), revoked_at: null, ...body });
			return Promise.resolve(new Response(null, { status: 201 }));
		}
		if (method === 'PATCH' && table === MACHINES && claims.service) return Promise.resolve(patch(parsed.searchParams, claims, body));
		return Promise.resolve(json({ message: 'refused' }, 403));
	}
	return { fetchImpl, calls, rows: (table = MACHINES) => tables.get(table) };
}

/** GoTrue's admin read of a user: the address the bridge reads for the poll. */
function gotrue(url) {
	const id = decodeURIComponent(String(url).split('/admin/users/')[1] ?? '');
	return Promise.resolve(EMAILS[id] ? json({ id, email: EMAILS[id] }) : json({ message: 'no user' }, 404));
}

export const routedFetch = (store) => (url, init) => (String(url).includes('/auth/v1/admin/users/') ? gotrue(url) : store.fetchImpl(url, init));

export const machineEnv = (over = {}) => ({ JWT_SECRET: ACCOUNT_JWT_SECRET, OSIONOS_MACHINE_SIGNING_KEY: SEED, OSIONOS_BRIDGE_PUBLIC_ORIGIN: ORIGIN, ...over });

/** The machine routes alone on a server, with a clock the test moves. */
export async function startMachineWorld(t, { rows = [], env = machineEnv(), fail = null, config = accountConfig() } = {}) {
	const clock = { at: Date.UTC(2026, 9, 31, 12) };
	const now = () => clock.at;
	const kv = createTtlKv({ now });
	const store = createMachineStore({ rows, fail });
	const fetchImpl = routedFetch(store);
	const pg = createPg({ config, env, fetchImpl, now: () => Date.now() });
	const routes = createMachineRoutes({ config, pg, kv, verifySession: verifyAppSessionToken, env, fetchImpl, now });
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? '/', 'http://localhost');
		if (await routes(url, request, response)) return;
		response.writeHead(599).end();
	});
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t.after(() => new Promise((done) => server.close(done)));
	const plain = (user = USER_A) => sessionToken(config, user);
	const sudo = (user = USER_A) => sudoToken(config, kv, user);
	return { base: `http://127.0.0.1:${server.address().port}`, clock, kv, store, config, plain, sudo };
}

/** A machine as osionos-node holds it: its own Ed25519 key, signing what the protocol says. */
export function fakeMachine({ name = 'laptop', platform = 'linux-x64' } = {}) {
	const { privateKey, publicKeyRaw } = generateAgentKeyPair();
	const pubkey = b64url(publicKeyRaw);
	return {
		privateKey, publicKeyRaw, pubkey, name,
		startBody: (ts, over = {}) => ({ pubkey, name, platform, version: '1.0.0', ts, sig: signMessage(privateKey, pairStartMessage({ origin: ORIGIN, pubkey, name, ts })), ...over }),
		pollBody: (pairId, ts) => ({ pairId, ts, sig: signMessage(privateKey, pairPollMessage({ origin: ORIGIN, pairId, ts })) }),
		heartbeatBody: (machineId, ts, ideOrigin = IDE_ORIGIN) => ({ machineId, ideOrigin, ts, sig: signMessage(privateKey, heartbeatMessage({ origin: ORIGIN, machineId, ideOrigin, ts })) }),
		whoamiBody: (machineId, nonce, ideOrigin = IDE_ORIGIN) => ({ nonce, sig: signMessage(privateKey, whoamiMessage({ origin: ORIGIN, machineId, ideOrigin, nonce })) }),
	};
}

/** One call: the status and the parsed body. */
export async function call(base, path, { method = 'POST', body, token, headers = {} } = {}) {
	const response = await fetch(`${base}${path}`, {
		method,
		headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	return { status: response.status, body: text ? JSON.parse(text) : null, headers: response.headers };
}

/** A machine paired all the way through the routes: start, claim, approve, poll. */
export async function pairThrough(world, { user = USER_A, machine = fakeMachine() } = {}) {
	const token = await world.sudo(user);
	const started = await call(world.base, '/api/machines/pair/start', { body: machine.startBody(world.clock.at) });
	const claimed = await call(world.base, '/api/machines/pair/claim', { token, body: { code: started.body.code } });
	const approved = await call(world.base, '/api/machines/pair/approve', { token, body: { pairId: claimed.body.pairId } });
	return { machine, token, started, claimed, approved, id: approved.body?.id };
}

/** A paired machine that has also sent one heartbeat, so it is online. */
export async function onlineMachine(world, options) {
	const paired = await pairThrough(world, options);
	world.clock.at += 1000;
	await call(world.base, '/api/machines/heartbeat', { body: paired.machine.heartbeatBody(paired.id, world.clock.at) });
	return paired;
}
