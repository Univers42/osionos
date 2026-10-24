/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mfa-world.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The world of the two-step verification suites: a bridge whose PostgREST knows the factor
 * and recovery tables (with the atomic conditional PATCH the replay guard relies on), whose
 * session cut-offs are ENFORCED (a confirmation is only real if the old token dies), and a
 * clock the test moves. Every request to the factor tables is logged.
 * Caveat: the fake compares `last_step` numerically but every other column as text, and a
 * PATCH is atomic only because the fake is single-threaded: it proves the bridge sends the
 * conditional filter, not that Postgres serialises two writers.
 */

import { randomUUID } from 'node:crypto';
import { createBridgeHandoff, createBridgeServer, validateBridgePayload } from '../../../scripts/bridge-api.mjs';
import { createPg } from '../../../scripts/bridge-pg.mjs';
import { grantSudo } from '../../../scripts/bridge-guard.mjs';
import { SessionCutoffs } from '../../../scripts/bridge-session-cutoff.mjs';
import { gotrueJwt } from './auth-world.mjs';
import { createCutoffSource } from './cutoff-source.mjs';
import { kvStub } from './kv-stub.mjs';
import { JWT_SECRET, USER_A, gatewayRequest, postJson, sessionConfig } from './session-world.mjs';
import { noFactorPg } from './no-factor-pg.mjs';
import { createSessionStore } from './session-postgrest.mjs';
import { mintHandoff, tokenClaims } from './session-signin.mjs';

export const MFA_KEY = Buffer.alloc(32, 7).toString('base64');
export const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');
export const TOTP_TABLE = 'osionos_mfa_totp';
export const CODES_TABLE = 'osionos_mfa_recovery_codes';
const GATEWAY = 'https://gateway.local';
const quietLog = { info() {}, warn() {} };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export { noFactorPg };

function matches(row, key, expr) {
	if (expr === 'is.null') return row[key] == null;
	const [operator, ...rest] = expr.split('.');
	const wanted = rest.join('.');
	const numeric = Number.isFinite(Number(wanted)) && Number.isFinite(Number(row[key]));
	const [left, right] = numeric ? [Number(row[key]), Number(wanted)] : [String(row[key] ?? '').toLowerCase(), wanted.toLowerCase()];
	if (operator === 'eq') return left === right;
	if (operator === 'lt') return left < right;
	if (operator === 'gt') return left > right;
	throw new Error(`mfa store: unsupported filter ${key}=${expr}`);
}

const RESERVED = new Set(['select', 'order', 'limit', 'on_conflict']);
const project = (row, select) => (!select || select === '*' ? { ...row } : Object.fromEntries(select.split(',').filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])));

/** The two factor tables. `failRead` / `failWrite` are { status, body } answers for the next kind of request. */
export function createMfaStore({ totp = [], recovery = [] } = {}) {
	const tables = new Map([[TOTP_TABLE, totp.map((row) => ({ ...row }))], [CODES_TABLE, recovery.map((row) => ({ ...row }))]]);
	const store = { calls: [], failRead: null, failWrite: null, frozenReads: null, holdReads: null, rows: (name = TOTP_TABLE) => tables.get(name) };
	store.fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const prefer = String(init.headers?.Prefer ?? '');
		const call = { method, table, params: parsed.searchParams, prefer, text: init.body ?? '', body: init.body ? JSON.parse(init.body) : undefined };
		store.calls.push(call);
		const failure = method === 'GET' ? store.failRead : store.failWrite;
		if (failure) return json(failure.body ?? {}, failure.status);
		const rows = tables.get(table);
		const hits = rows.filter((row) => [...parsed.searchParams].every(([key, expr]) => RESERVED.has(key) || matches(row, key, expr)));
		const answer = (list) => (prefer.includes('return=representation') ? json(list.map((row) => project(row, parsed.searchParams.get('select'))), method === 'POST' ? 201 : 200) : new Response(null, { status: 204 }));
		// `frozenReads` is the snapshot two racing requests both read before either writes.
		if (method === 'GET' && table === TOTP_TABLE && store.holdReads) await store.holdReads;
		if (method === 'GET' && store.frozenReads && table === TOTP_TABLE) return json(store.frozenReads.map((row) => project(row, parsed.searchParams.get('select'))));
		if (method === 'GET') return json(hits.map((row) => project(row, parsed.searchParams.get('select'))));
		if (method === 'POST') {
			// One statement: a duplicate anywhere in the batch rejects the whole request, as in Postgres.
			const batch = Array.isArray(call.body) ? call.body : [call.body];
			const same = (left, right) => left.user_id === right.user_id && (table === TOTP_TABLE || left.code_hmac === right.code_hmac);
			const duplicate = batch.some((item, index) => rows.some((row) => same(row, item)) || batch.slice(0, index).some((earlier) => same(earlier, item)));
			if (duplicate) return json({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
			rows.push(...batch.map((item) => ({ ...item })));
			return answer(batch);
		}
		if (method === 'PATCH') {
			for (const row of hits) Object.assign(row, call.body);
			return answer(hits);
		}
		if (method === 'DELETE') {
			tables.set(table, rows.filter((row) => !hits.includes(row)));
			return answer(hits);
		}
		return json({ message: `mfa store: ${method} is not served` }, 405);
	};
	return store;
}

export const verifiedRow = (userId, secretEnc, extra = {}) => ({ user_id: userId, secret_enc: secretEnc, status: 'verified', last_step: 0, created_at: '2026-10-01T00:00:00.000Z', verified_at: '2026-10-01T00:00:00.000Z', ...extra });

/**
 * A running bridge. `api` sends a call with a bearer token and an optional client address;
 * `signIn` goes through the handoff and consume the way the app does; `sudo` opens the
 * sudo window of a token; `advance` moves the bridge clock.
 */
export async function startMfaWorld(t, { env = { OSIONOS_MFA_SECRET_KEY: MFA_KEY }, totp = [], recovery = [], cutoffRows = [], ipHeader = 'x-forwarded-for', records = 'on' } = {}) {
	const clock = { at: Date.now() };
	const mfa = createMfaStore({ totp, recovery });
	const sessions = createSessionStore();
	const cutoffs = createCutoffSource(cutoffRows);
	const world = { clock, mfa, sessions, cutoffs, cutoffWrites: [], cutoffCallIndex: [], failCutoffWrite: false, failSessionPatch: false, failPatRevoke: false, kv: kvStub(), subject: USER_A };
	// The gateway's session route mints through the real handoff, so login and exchange reach the same mint site as a handoff.
	const gateway = async (route) => {
		if (route === '/api/auth/login') return json({ access_token: 'gateway-token', user: { id: world.subject } });
		const payload = validateBridgePayload({ provider: 'prismatica', subject: world.subject, email: 'member@example.com', name: 'Member', jti: randomUUID() });
		return json(await createBridgeHandoff({ payload, config, kv: world.kv, pg: world.pg, now: clock.at, fetchImpl }));
	};
	const fetchImpl = async (url, init = {}) => {
		if (String(url).startsWith(GATEWAY)) return gateway(String(url).slice(GATEWAY.length));
		if (String(url).endsWith('/auth/v1/user')) return json({ id: world.subject });
		const table = new URL(String(url)).pathname.replace('/rest/v1/', '');
		if (table.startsWith('osionos_mfa_')) return mfa.fetchImpl(url, init);
		if (table === 'osionos_personal_access_tokens' && init.method === 'PATCH' && world.failPatRevoke) return json({ message: 'boom' }, 500);
		if (table === 'osionos_sessions' && init.method === 'PATCH' && world.failSessionPatch) return json({ message: 'boom' }, 500);
		if (table !== 'auth_session_cutoffs') return sessions.fetchImpl(url, init);
		if (init.method !== 'POST') return cutoffs.fetchImpl(url, init);
		if (world.failCutoffWrite) return json({ message: 'boom' }, 500);
		const body = JSON.parse(init.body);
		world.cutoffWrites.push(body);
		// Where in the factor-table log the cut-off landed, so a spec can order it against the row flip.
		world.cutoffCallIndex.push(mfa.calls.length);
		cutoffs.rows = [...cutoffs.rows.filter((row) => row.user_id !== body.user_id), body];
		return new Response(null, { status: 201 });
	};
	const config = sessionConfig({ now: () => clock.at, ipHeader, records });
	config.sessionCutoffs = new SessionCutoffs({ enforced: true, now: () => clock.at, log: quietLog });
	config.sessionCutoffs.completeLoad(new Map(), config.sessionCutoffs.beginLoad());
	config.gatewayUrl = GATEWAY;
	config.publicApiKey = 'public-anon-test-key';
	const serverEnv = { JWT_SECRET, ...env };
	world.pg = createPg({ config, env: serverEnv, fetchImpl, now: () => clock.at });
	const server = createBridgeServer({ config, fetchImpl, kv: world.kv, pg: world.pg, env: serverEnv, now: () => clock.at });
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t.after(() => new Promise((done) => server.close(done)));
	const base = `http://127.0.0.1:${server.address().port}`;
	Object.assign(world, { config, server, base });
	world.advance = (ms) => { clock.at += ms; };
	world.api = async (method, path, token, { body, ip = '198.51.100.7' } = {}) => {
		const headers = { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) };
		const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
		const text = await response.text();
		return { status: response.status, text, body: text ? JSON.parse(text) : null, headers: response.headers };
	};
	// The unasserted handoff mint, for the specs that expect it to be refused.
	world.mintRaw = (subject = USER_A) => {
		const request = gatewayRequest({ provider: 'prismatica', subject, email: 'member@example.com', name: 'Member', jti: randomUUID() }, { timestamp: clock.at });
		return postJson(base, '/api/auth/bridge/session', { headers: request.headers, body: JSON.parse(request.body) });
	};
	world.signIn = async (subject = USER_A) => {
		const handoff = await mintHandoff(base, subject);
		const answer = await postJson(base, '/api/auth/bridge/consume', { headers: { 'user-agent': 'mfa-test-agent' }, body: { token: handoff } });
		if (answer.status !== 200) throw new Error(`sign-in answered ${answer.status}: ${answer.text}`);
		const { accessToken, refreshToken } = answer.body.session;
		return { answer, accessToken, refreshToken, claims: tokenClaims(accessToken) };
	};
	world.login = () => world.api('POST', '/api/auth/login', null, { body: { email: 'member@example.com', password: 'correct horse battery' } });
	world.exchange = () => world.api('POST', '/api/auth/exchange', null, { body: { accessToken: gotrueJwt({ sub: world.subject }) } });
	world.sudo = (accessToken) => grantSudo(world.kv, { userId: tokenClaims(accessToken).sub, raw: { jti: tokenClaims(accessToken).jti } });
	world.audit = () => sessions.rows('osionos_bridge_audit_events');
	return world;
}

