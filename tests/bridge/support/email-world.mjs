/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   email-world.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The world of the secondary-email suites: the account handler over a two-user fake of the
 * osionos_user_emails table (with the unique indexes the database enforces), GoTrue's admin
 * read and list (honouring per_page), and grobase's login-OTP service. Every effect lands in
 * one ordered log, so a test can say "audit before insert before mail".
 * Caveat: the table fake parses only the filters the bridge sends (eq, neq, lt, is.null,
 * not.is.null); the partial unique index is modelled, but only the real database proves it.
 */

import { randomUUID } from 'node:crypto';
import { verifyAppSessionToken } from '../../../scripts/bridge-api.mjs';
import { createAccountHandler } from '../../../scripts/bridge-account-mounts.mjs';
import { createPg } from '../../../scripts/bridge-pg.mjs';
import { createSessionStore } from './session-postgrest.mjs';
import { ACCOUNT_JWT_SECRET, accountConfig, sessionToken, sudoToken, USER_A, USER_B } from './account-world.mjs';
import { otpProof } from './account-otp.mjs';
import { kvStub } from './kv-stub.mjs';
import { callRoute } from './route-call.mjs';

export const CODE = '123456';
export const PATH = '/api/account/emails';
export const SEAL_KEY = Buffer.alloc(32, 5).toString('base64');
export const MFA_KEY = Buffer.alloc(32, 9).toString('base64');
export const LOOKUP_KEY = 'l'.repeat(40);
export const goodEnv = () => ({ JWT_SECRET: ACCOUNT_JWT_SECRET, OSIONOS_EMAIL_SEAL_KEY: SEAL_KEY, OSIONOS_EMAIL_LOOKUP_KEY: LOOKUP_KEY, OSIONOS_MFA_SECRET_KEY: MFA_KEY });
export { USER_A, USER_B };

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const dup = () => Object.assign(new Error('duplicate key'), { status: 409, code: 'baas_failed', upstreamStatus: 409, upstreamCode: '23505' });

function matches(row, key, expr) {
	if (expr === 'is.null') return row[key] == null;
	if (expr === 'not.is.null') return row[key] != null;
	const dot = expr.indexOf('.');
	const [op, wanted] = [expr.slice(0, dot), expr.slice(dot + 1)];
	if (op === 'eq') return String(row[key]) === wanted;
	if (op === 'neq') return String(row[key]) !== wanted;
	if (op === 'lt') return String(row[key]) < wanted;
	throw new Error(`email table: unsupported filter ${key}=${expr}`);
}

/** The pg facade: `asService()` with get/post/patch/del over the one table, and the audit sink. */
export function createEmailTable({ events, now }) {
	const table = { rows: [], audits: [], calls: [], fail: () => null, raise23505: false };
	const select = (path) => {
		const [name, query = ''] = path.split('?');
		const params = new URLSearchParams(query);
		const reserved = new Set(['select', 'order', 'limit']);
		const hits = table.rows.filter((row) => [...params].every(([key, expr]) => reserved.has(key) || matches(row, key, expr)));
		return { name, hits };
	};
	const guard = (op, path) => {
		table.calls.push({ op, path });
		const failure = table.fail(op, path);
		if (failure) throw Object.assign(new Error('upstream'), { status: 503, code: 'baas_failed', ...failure });
	};
	const conflicts = (row) => table.rows.some((other) => other !== row && ((other.user_id === row.user_id && other.email_hmac === row.email_hmac) || (row.verified_at && other.verified_at && other.email_hmac === row.email_hmac)));
	const client = {
		async get(path) { guard('get', path); return select(path).hits.map((row) => ({ ...row })); },
		async post(path, body) {
			if (path === 'osionos_bridge_audit_events') {
				if (table.failAudit === true || table.failAudit?.(body)) throw new Error('audit down');
				table.audits.push(body);
				events.push(`audit:${body.event_type}`);
				return null;
			}
			guard('post', path);
			if (table.raise23505) throw dup();
			const row = { id: randomUUID(), created_at: new Date(now()).toISOString(), verified_at: null, ...body };
			if (conflicts(row)) throw dup();
			table.rows.push(row);
			events.push('insert');
			return [{ ...row }];
		},
		async patch(path, body) {
			guard('patch', path);
			const { hits } = select(path);
			for (const row of hits) {
				if (table.raise23505 || (body.verified_at && table.rows.some((other) => other !== row && other.verified_at && other.email_hmac === row.email_hmac))) throw dup();
				Object.assign(row, body);
			}
			return hits.map((row) => ({ ...row }));
		},
		async del(path, options) {
			guard('del', path);
			const { hits } = select(path);
			if (hits.length) events.push('delete');
			table.rows = table.rows.filter((row) => !hits.includes(row));
			return String(options?.prefer ?? '').includes('representation') ? hits.map((row) => ({ ...row })) : null;
		},
	};
	table.pg = { asService: () => client, asUser: () => { throw new Error('pg asUser must not be used'); } };
	return table;
}

/** GoTrue's admin routes: read one user, list by containment filter capped at per_page. */
export function createDirectory(users) {
	const directory = { users, calls: [], puts: [], hold: null, fail: false, onPut: null };
	directory.handle = async (url, init = {}) => {
		directory.calls.push(`${init.method ?? 'GET'} ${url.pathname}${url.search}`);
		if (init.method === 'PUT') return directory.put(url, JSON.parse(init.body));
		if (directory.hold && url.pathname === '/auth/v1/admin/users') await directory.hold;
		if (directory.fail) return json({}, 500);
		if (url.pathname === '/auth/v1/admin/users') {
			const filter = (url.searchParams.get('filter') ?? '').toLowerCase();
			const perPage = Number(url.searchParams.get('per_page') ?? 50);
			return json({ users: Object.values(directory.users).filter((user) => user.email.toLowerCase().includes(filter)).slice(0, perPage) });
		}
		const user = directory.users[decodeURIComponent(url.pathname.split('/').pop())];
		return user ? json(user) : json({}, 404);
	};
	/** The admin PUT: GoTrue's behaviour when `onPut` does not override it (measured 2026-10-24: applies, confirms, lower-cases). */
	directory.put = async (url, body) => {
		const id = decodeURIComponent(url.pathname.split('/').pop());
		directory.puts.push({ id, body });
		if (directory.onPut) { const custom = await directory.onPut(id, body); if (custom) return custom; }
		const email = String(body.email).toLowerCase();
		if (Object.values(directory.users).some((other) => other.id !== id && other.email.toLowerCase() === email)) return json({ code: '23505', msg: 'duplicate' }, 500);
		Object.assign(directory.users[id], { email, email_confirmed_at: body.email_confirm ? '2026-10-24T10:00:00Z' : null });
		return json(directory.users[id]);
	};
	return directory;
}

/** grobase's OTP service: one live code per address, 5 guesses, proofs bound to the address asked for. */
export function createGrobase({ events, now }) {
	const grobase = { requests: [], verifies: [], requestStatus: 200, hold: null, guesses: new Map() };
	grobase.handle = async (url, body) => {
		if (url.pathname === '/v1/auth/otp/request') {
			grobase.requests.push(body.email);
			events.push('otp-request');
			if (grobase.hold) await grobase.hold;
			if (grobase.requestStatus !== 200) return json({ error: 'send_failed' }, grobase.requestStatus);
			grobase.guesses.set(body.email.toLowerCase(), 0);
			return json({ sent: true });
		}
		grobase.verifies.push(body);
		const address = body.email.toLowerCase();
		const used = (grobase.guesses.get(address) ?? 0) + 1;
		grobase.guesses.set(address, used);
		if (used > 5) return json({}, 429);
		if (body.code !== CODE) return json({}, 401);
		return json({ verified: true, proof: otpProof({ email: address, secret: ACCOUNT_JWT_SECRET, now: now() }) });
	};
	return grobase;
}

const user = (id, email, confirmed = true) => ({ id, email, email_confirmed_at: confirmed ? '2026-09-01T00:00:00Z' : null, created_at: '2026-09-01T00:00:00Z' });

/** The whole world. `env` replaces the key set; `users` are extra GoTrue accounts. */
export function createEmailWorld({ env = goodEnv(), users = [] } = {}) {
	const events = [];
	const clock = { at: Date.parse('2026-10-24T10:00:00Z') };
	const now = () => clock.at;
	const config = accountConfig();
	const kv = kvStub();
	kv.del = async (key) => { kv.values.delete(`osb:${key}`); };
	const table = createEmailTable({ events, now });
	const directory = createDirectory({ [USER_A]: user(USER_A, 'a@example.com'), [USER_B]: user(USER_B, 'b@example.com'), ...Object.fromEntries(users.map((entry) => [entry.id, entry])) });
	const grobase = createGrobase({ events, now });
	const tracked = [];
	const fetchImpl = async (input, init = {}) => {
		const url = new URL(String(input));
		if (url.pathname.startsWith('/v1/auth/otp/')) return grobase.handle(url, JSON.parse(init.body));
		if (url.pathname === '/rest/v1/auth_session_cutoffs') {
			world.cutoffs.push(JSON.parse(init.body));
			return json({}, world.cutoffStatus);
		}
		if (init.method === 'PUT') events.push('put');
		return directory.handle(url, init);
	};
	const handler = createAccountHandler({ config, pg: table.pg, kv, verifySession: verifyAppSessionToken, mfaEnv: env, mfaFetch: fetchImpl, mfaNow: now, emailTrack: (promise) => tracked.push(promise) });
	const world = { cutoffs: [], cutoffStatus: 201, events, clock, config, kv, table, directory, grobase, env, tracked, user };
	world.drain = async () => { while (tracked.length) await Promise.allSettled(tracked.splice(0)); };
	world.call = async (userId, { method = 'GET', path = PATH, body, sudo = true } = {}) => {
		const token = sudo ? await sudoToken(config, kv, userId) : sessionToken(config, userId);
		return callRoute(handler, { method, path, body, headers: { authorization: `Bearer ${token}` } });
	};
	/** A call that reuses one session across calls, so budgets and sudo share a jti. */
	world.token = (userId) => sudoToken(config, kv, userId);
	world.callWith = (token, { method = 'POST', path, body } = {}) => callRoute(handler, { method, path, body, headers: { authorization: `Bearer ${token}` } });
	/** Turns the session-records path on over these rows; the email table keeps serving its own paths. */
	world.recordSessions = (rows) => {
		const store = createSessionStore({ rows });
		const sessions = createPg({ config, env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl: store.fetchImpl }).asService();
		const emails = table.pg.asService();
		const routed = (verb) => (path, ...rest) => (path.startsWith('osionos_sessions') ? sessions : emails)[verb](path, ...rest);
		const client = { get: routed('get'), post: routed('post'), patch: routed('patch'), del: routed('del') };
		table.pg.asService = () => client;
		config.sessionRecords = { enabled: true };
		return store;
	};
	world.add = (userId, email) => world.call(userId, { method: 'POST', body: { email } });
	return world;
}
