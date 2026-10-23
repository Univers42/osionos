/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-erasure-world.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Two fakes for the deletion executor.
 *
 * `createErasureWorld` stands in for PostgREST, GoTrue and the storage router at once and
 * keeps ONE ordered call log, so the order of the steps is asserted on what the fake
 * saw. `world.fail` names the operations that answer an error, `world.crashed` makes
 * every operation throw (a killed process), and `world.after[label]` runs a hook right
 * after an operation (a user cancelling mid-run, a late write by a still-valid token).
 *
 * `startIdentityWorld` is the account handler over the shared account store, with the
 * service-role reads of the deletion table and the notification insert that the shared
 * fake does not serve (it hides the table from the service role on purpose).
 * Caveat: the guard trigger and the claim lease are modelled, not run; the real ones are
 * proved by account-checks.sql.
 */

import { createServer } from 'node:http';
import { createAccountHandler } from '../../../scripts/bridge-account-mounts.mjs';
import { createPg } from '../../../scripts/bridge-pg.mjs';
import { verifyAppSessionToken } from '../../../scripts/bridge-api.mjs';
import { createAccountStore } from './account-postgrest.mjs';
import { kvStub } from './kv-stub.mjs';
import { ACCOUNT_JWT_SECRET, accountConfig } from './account-world.mjs';

export const STORAGE_URL = 'http://storage.local/v1';
const LEASE_MS = 30 * 60_000;
const SERVICE_AUTH = 'Bearer service-role-test-key';

function upstream(text) {
	return Object.assign(new Error(text), { upstreamText: text, upstreamStatus: 400 });
}

export function createErasureWorld({ users = [], objects = {} } = {}) {
	const clock = { at: Date.parse('2026-11-20T00:00:00Z') };
	const world = {
		log: [],
		fail: new Set(),
		crashed: false,
		after: {},
		sleeps: [],
		clock,
		requests: new Map(users.map((id) => [id, { user_id: id, scheduled_for: '2026-11-01T00:00:00Z', attempts: 0, erased_at: null, claimed_at: null, last_error: null, successor_user_id: null }])),
		objects: new Map(Object.entries(objects).map(([id, list]) => [id, list.map((entry) => ({ ...entry }))])),
		data: new Map(users.map((id) => [id, ['row']])),
		bannedAuth: new Set(),
		deletedAuth: new Set(),
		erases: new Map(),
		count: 0,
		killAfter: 0,
		banReply: null,
		deleteReply: null,
	};

	function record(label, userId) {
		if (world.crashed) throw new Error('process killed');
		world.log.push(userId ? `${label}:${userId}` : label);
		if (world.fail.has(label)) throw upstream(`${label} failed`);
		world.after[label]?.(userId);
		world.count += 1;
		if (world.count === world.killAfter) world.crashed = true;
	}

	function pick(limit, stamp) {
		const due = [...world.requests.values()]
			.filter((r) => Date.parse(r.scheduled_for) <= clock.at && r.attempts < 5)
			.filter((r) => !stamp || !r.claimed_at || clock.at - r.claimed_at > LEASE_MS)
			.slice(0, limit);
		if (stamp) for (const r of due) { r.claimed_at = clock.at; r.attempts += 1; }
		return due.map((r) => ({ ...r }));
	}

	function erase(userId) {
		const request = world.requests.get(userId);
		if (!request) throw upstream('no_deletion_request');
		request.erased_at ??= clock.at;
		world.data.set(userId, []);
		world.erases.set(userId, (world.erases.get(userId) ?? 0) + 1);
		for (const entry of world.objects.get(userId) ?? []) entry.recorded = true;
		return { counts: { rows: 1 }, dispositions: { transferred: 0 }, successor: 'none' };
	}

	const service = {
		async get(path) {
			const [table, query = ''] = path.split('?');
			const params = new URLSearchParams(query);
			const userId = params.get('user_id')?.replace('eq.', '');
			if (table === 'osionos_account_deletion_requests') {
				if (params.get('attempts')) return [...world.requests.values()].filter((r) => r.attempts >= 5).map((r) => ({ user_id: r.user_id }));
				record('read_request', userId);
				return world.requests.has(userId) ? [{ user_id: userId }] : [];
			}
			if (table === 'osionos_account_erasure_objects') return (world.objects.get(userId) ?? []).map(({ bucket, key }) => ({ bucket, key }));
			throw new Error(`unexpected get ${table}`);
		},
		async post(table, row) {
			if (table !== 'osionos_bridge_audit_events') throw new Error(`unexpected post ${table}`);
			record(`audit:${row.event_type}`, row.subject);
			world.audits = [...(world.audits ?? []), row];
		},
		async patch(path, body) {
			const [table, query] = path.split('?');
			const userId = new URLSearchParams(query).get('user_id').replace('eq.', '');
			if (table === 'osionos_personal_access_tokens') return (record('pat_revoke', userId), []);
			if (world.crashed) throw new Error('process killed');
			world.requests.get(userId).last_error = body.last_error;
			world.log.push(`last_error:${body.last_error}`);
			return [];
		},
		async del(path) {
			const userId = path.split('user_id=eq.')[1];
			record('objects_rows_delete', userId);
			world.objects.set(userId, []);
		},
		async rpc(fn, args) {
			const userId = args.p_user;
			if (fn === 'osionos_account_deletion_due') return (record('due'), pick(args.p_limit, false));
			if (fn === 'osionos_account_deletion_claim') {
				record('claim');
				const picked = pick(Math.min(args.p_limit, 5), true);
				world.after.claimed?.(picked);
				return picked;
			}
			if (fn === 'osionos_account_erase_plan') return (record('plan', userId), { counts: { rows: 1 }, dispositions: {}, successor: 'none' });
			record('erase', userId);
			return erase(userId);
		},
	};

	const pg = { asService: () => service };
	const config = { baasUrl: 'https://baas.local', serviceKey: 'service-role-test-key' };
	const env = { OSIONOS_ACCOUNT_DELETION_EXECUTOR: '1', STORAGE_ROUTER_URL: STORAGE_URL };
	const ok = () => new Response(null, { status: 200 });
	const no = () => new Response('boom', { status: 500 });

	async function fetchImpl(url, init = {}) {
		const text = String(url);
		const method = init.method ?? 'GET';
		const user = text.match(/users\/([^/?]+)/)?.[1];
		try {
			if (text.includes('auth_session_cutoffs')) return (record('cutoff', JSON.parse(init.body).user_id), ok());
			if (text.includes('/auth/v1/admin/users/') && method === 'PUT') {
				const unban = JSON.parse(init.body).ban_duration === 'none';
				record(unban ? 'unban' : 'ban', user);
				if (!unban) world.bannedAuth.add(user);
				const noEffect = world.banReply === 'no_effect' && !unban;
				const bannedUntil = unban ? null : new Date(clock.at + 100 * 365 * 24 * 3_600_000).toISOString();
				return new Response(JSON.stringify(noEffect ? {} : { banned_until: bannedUntil }), { status: 200 });
			}
			if (text.includes('/auth/v1/admin/users/') && method === 'DELETE') {
				record('gotrue_delete', user);
				if (world.deleteReply === 'kong') return new Response('{"message":"no Route matched with those values"}', { status: 404 });
				world.deletedAuth.add(user);
				if (world.deleteReply === 'gone') {
					world.requests.delete(user);
					return new Response('{"code":404,"error_code":"user_not_found","msg":"User not found"}', { status: 404 });
				}
				world.requests.delete(user);
				return ok();
			}
			if (text.startsWith(STORAGE_URL) && method === 'DELETE') {
				const [, bucket, key] = text.slice(STORAGE_URL.length).split('/').slice(1);
				const owner = init.headers['x-user-id'];
				record(`object_delete:${bucket}/${decodeURIComponent(key)}`, owner);
				return ok();
			}
		} catch (error) {
			if (error.upstreamText) return no();
			throw error;
		}
		throw new Error(`unexpected fetch ${method} ${text}`);
	}

	const runnerDeps = (overrides = {}) => ({
		config, pg, fetchImpl, env,
		now: () => clock.at,
		sleep: async (ms) => { record('sleep'); world.sleeps.push(ms); world.after.sleep?.(ms); },
		log: { info: (...a) => world.log.push(`info:${a.join(' ')}`), warn: (...a) => world.log.push(`warn:${a.join(' ')}`) },
		...overrides,
	});

	return Object.assign(world, { pg, config, env, fetchImpl, runnerDeps });
}

/** The first index of `label` in a user's slice of the log, for order assertions. */
export function indexOfStep(log, label) {
	return log.findIndex((entry) => entry === label || entry.startsWith(`${label}:`));
}

function identityRows(store, params) {
	const rows = store.rows('osionos_account_deletion_requests');
	return rows.filter((row) => [...params].every(([key, expr]) => {
		if (['select', 'limit'].includes(key)) return true;
		const [op, value] = [expr.split('.')[0], expr.split('.').slice(1).join('.')];
		if (op === 'is') return row[key] == null;
		return String(row[key] ?? '').toLowerCase() === value.toLowerCase();
	}));
}

/** The account handler with the pieces the identity routes need but the shared fake hides. */
export async function startIdentityWorld(t, { rows = {}, failNotification = false, kv = kvStub() } = {}) {
	const store = createAccountStore(rows);
	const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
	const fetchImpl = async (url, init = {}) => {
		const parsed = new URL(String(url));
		const table = parsed.pathname.replace('/rest/v1/', '');
		const method = init.method ?? 'GET';
		const service = init.headers?.Authorization === SERVICE_AUTH;
		if (service && table === 'osionos_account_deletion_requests') {
			const hits = identityRows(store, parsed.searchParams);
			if (method === 'GET') return json(hits.map((row) => ({ ...row })));
			if (method === 'PATCH') {
				for (const row of hits) Object.assign(row, JSON.parse(init.body));
				return json(hits);
			}
		}
		if (service && table === 'osionos_notifications' && method === 'POST') {
			if (failNotification) return json({ message: 'down' }, 500);
			store.rows('osionos_notifications').push(JSON.parse(init.body));
			return new Response(null, { status: 204 });
		}
		if (!service && method === 'DELETE' && table === 'osionos_account_deletion_requests') {
			const erased = identityRows(store, parsed.searchParams).some((row) => row.erased_at);
			if (erased) return json({ code: 'P0001', message: 'deletion_in_progress' }, 400);
		}
		return store.fetchImpl(url, init);
	};
	const config = accountConfig();
	const pg = createPg({ config, env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl });
	const handler = createAccountHandler({ config, pg, kv, verifySession: verifyAppSessionToken, env: { JWT_SECRET: ACCOUNT_JWT_SECRET } });
	const server = createServer(async (request, response) => {
		const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
		if (await handler(url, request, response)) return;
		response.writeHead(404).end();
	});
	await new Promise((done) => server.listen(0, '127.0.0.1', done));
	t?.after(() => new Promise((done) => server.close(done)));
	return { base: `http://127.0.0.1:${server.address().port}`, store, config, kv };
}
