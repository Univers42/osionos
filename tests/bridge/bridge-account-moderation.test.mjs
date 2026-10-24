/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-moderation.test.mjs                  +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The moderation queue (P3-4-e, bridge half): who may read it, the keyset page, the four
 * decisions and what each one does to the person, and the one function that refuses a
 * suspended or banned sign-in on the handoff, the exchange and the refresh paths.
 *
 * The state of a person is the most severe LIVE decision (D-P3-4s 10): a ban beats a
 * suspension, an expired suspension is nothing, and only the same report re-decided to
 * dismiss lifts one. Only subject_kind 'user' reports move a person (D-P3-4s 11).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createBridgeHandoff, validateBridgePayload } from '../../scripts/bridge-api.mjs';
import { handleAuthExchange } from '../../scripts/bridge-auth-exchange.mjs';
import { assertAccountNotRefused } from '../../scripts/bridge-account-moderation.mjs';
import { createPg } from '../../scripts/bridge-pg.mjs';
import { ACCOUNT_JWT_SECRET, USER_A, USER_B, accountConfig, send } from './support/account-world.mjs';
import { roleTables, startAdminWorld, tokenFor } from './support/admin-route-world.mjs';
import { createKeysetStore } from './support/keyset-postgrest.mjs';
import { kvStub } from './support/kv-stub.mjs';
import { gotrueJwt } from './support/auth-world.mjs';
import { startSessionBridge, sessionConfig, postJson } from './support/session-world.mjs';
import { createSessionStore } from './support/session-postgrest.mjs';
import { mintHandoff, refreshWith, signIn } from './support/session-signin.mjs';

const TARGET = 'cccccccc-3333-4333-8333-cccccccccccc';
const MODERATOR = 'dddddddd-4444-4444-8444-dddddddddddd';
const [R1, R2, R3] = ['11111111-aaaa-4aaa-8aaa-000000000001', '11111111-aaaa-4aaa-8aaa-000000000002', '11111111-aaaa-4aaa-8aaa-000000000003'];
const PATH = '/api/account/admin/reports';
const REPORTS = 'osionos_user_reports';
const AUDIT = 'osionos_bridge_audit_events';
const SELECT = 'id,reporter_id,subject_user_id,subject_kind,subject_id,category,details,status,decision,decision_until,decision_by,decision_at,created_at';
const FUTURE = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

function report(id, extra = {}) {
	return {
		id, reporter_id: USER_B, subject_user_id: TARGET, subject_kind: 'user', subject_id: TARGET, category: 'spam', details: 'sells pills',
		status: 'open', decision: null, decision_until: null, decision_by: null, decision_at: null, decision_note: null,
		created_at: `2026-10-0${id.slice(-1)}T00:00:00.000Z`, ...extra,
	};
}

function seed({ reports = [report(R1)], grants = [{ userId: USER_A, role: 'admin' }, { userId: MODERATOR, role: 'moderator' }, { userId: USER_B, role: 'user' }], ...more } = {}) {
	return {
		...roleTables(grants),
		[REPORTS]: reports,
		osionos_profiles: [{ user_id: TARGET, display_name: 'Casey', email: 'casey@example.com' }, { user_id: USER_B, display_name: 'Bob', email: 'bob@example.com' }],
		osionos_sessions: [],
		osionos_notifications: [],
		osionos_bridge_identities: [],
		[AUDIT]: [],
		...more,
	};
}

const world = (t, tables = seed(), extra = {}) => startAdminWorld(t, { path: PATH, tables, ...extra });
const decide = (w, id, body, token = w.admin) => w.call(`/${id}/decision`, { method: 'POST', token, body });
const writes = (w, table) => w.store.callsTo(table).filter((call) => call.method !== 'GET');

describe('the queue', () => {
	it('lists the open reports with the target name, selecting exactly the allowlist', async (t) => {
		const w = await world(t, seed({ reports: [report(R1), report(R2, { status: 'resolved' }), report(R3)] }));
		const answer = await w.call('');
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body.reports.map((entry) => entry.id), [R3, R1]);
		assert.equal(answer.body.reports[0].subjectName, 'Casey');
		const read = w.store.callsTo(REPORTS)[0];
		assert.equal(read.params.get('select'), SELECT);
		assert.equal(read.params.get('status'), 'eq.open');
		assert.equal(answer.text.includes('example.com'), false);
		assert.equal(w.store.callsTo('osionos_sessions').length + w.store.callsTo('osionos_settings').length, 0);
	});

	it('pages by keyset: the second page carries the or filter and the last one no cursor', async (t) => {
		const w = await world(t, seed({ reports: [report(R1), report(R2), report(R3)] }));
		const first = await w.call('?limit=2');
		assert.deepEqual(first.body.reports.map((entry) => entry.id), [R3, R2]);
		const second = await w.call(`?limit=2&cursor=${first.body.nextCursor}`);
		assert.deepEqual(second.body.reports.map((entry) => entry.id), [R1]);
		assert.equal(second.body.nextCursor, null);
		assert.match(w.store.callsTo(REPORTS)[1].params.get('or'), /^\(created_at\.lt\./);
	});

	it('refuses a status the queue does not know', async (t) => {
		const w = await world(t);
		const answer = await w.call('?status=banana');
		assert.equal(answer.status, 422);
		assert.equal(answer.body.code, 'invalid_status');
	});

	for (const [name, userId, claim, status] of [['a plain user', USER_B, false, 403], ['a token that CLAIMS admin without the grant', USER_B, true, 403], ['a moderator', MODERATOR, false, 200], ['an admin', USER_A, false, 200]]) {
		it(`gates the read on the re-read role: ${name} gets ${status}`, async (t) => {
			const w = await world(t);
			const answer = await w.call('', { token: tokenFor(w.config, userId, claim) });
			assert.equal(answer.status, status);
			if (status === 403) {
				assert.equal(answer.body.code, 'moderator_required');
				assert.equal(w.store.callsTo(REPORTS).length, 0);
			}
		});
	}
});

describe('the decisions', () => {
	it('warn: writes the audit row before the PATCH, resolves the report and sends one system notice', async (t) => {
		const w = await world(t);
		const answer = await decide(w, R1, { decision: 'warn', note: 'first warning' });
		assert.equal(answer.status, 200);
		const row = w.store.rows(REPORTS)[0];
		assert.equal(row.decision, 'warn');
		assert.equal(row.status, 'resolved');
		assert.equal(row.decision_by, USER_A);
		assert.equal(row.decision_until, null);
		assert.equal(row.decision_note, 'first warning');
		assert.deepEqual(w.store.rows(AUDIT).map((entry) => [entry.event_type, entry.details]), [['moderation_decision', { reportId: R1, targetUserId: TARGET, decision: 'warn', until: null }]]);
		const order = w.store.calls.filter((call) => call.method !== 'GET').map((call) => call.table);
		assert.ok(order.indexOf(AUDIT) < order.indexOf(REPORTS));
		const notices = w.store.rows('osionos_notifications');
		assert.equal(notices.length, 1);
		assert.equal(notices[0].type, 'system');
		assert.equal(notices[0].user_id, TARGET);
		assert.equal(writes(w, 'osionos_sessions').length, 0);
	});

	for (const [name, until] of [['missing', undefined], ['in the past', '2020-01-01T00:00:00.000Z'], ['beyond 30 days', new Date(Date.now() + 31 * 86_400_000).toISOString()], ['not a date', 'tomorrow']]) {
		it(`suspend with an until that is ${name} is refused and leaves the row alone`, async (t) => {
			const w = await world(t);
			const answer = await decide(w, R1, { decision: 'suspend', until });
			assert.equal(answer.status, 422);
			assert.equal(answer.body.code, 'invalid_until');
			assert.equal(w.store.rows(REPORTS)[0].decision, null);
			assert.equal(w.store.rows(AUDIT).length, 0);
		});
	}

	it('ban with an until is refused: a ban has no end', async (t) => {
		const w = await world(t);
		const answer = await decide(w, R1, { decision: 'ban', until: FUTURE() });
		assert.equal(answer.status, 422);
		assert.equal(answer.body.code, 'invalid_until');
	});

	for (const [decision, extra] of [['suspend', { until: FUTURE() }], ['ban', {}]]) {
		it(`${decision} revokes only the target's live sessions, reason admin`, async (t) => {
			const sessions = [
				{ id: 's1', user_id: TARGET, expires_at: FUTURE(), revoked_at: null, revoked_reason: null },
				{ id: 's2', user_id: TARGET, expires_at: FUTURE(), revoked_at: '2026-10-01T00:00:00.000Z', revoked_reason: 'logout' },
				{ id: 's3', user_id: USER_B, expires_at: FUTURE(), revoked_at: null, revoked_reason: null },
			];
			const w = await world(t, seed({ osionos_sessions: sessions }));
			const answer = await decide(w, R1, { decision, ...extra });
			assert.equal(answer.status, 200);
			const [s1, s2, s3] = w.store.rows('osionos_sessions');
			assert.equal(s1.revoked_reason, 'admin');
			assert.ok(s1.revoked_at);
			assert.equal(s2.revoked_reason, 'logout');
			assert.equal(s3.revoked_at, null);
			assert.equal(w.store.rows(REPORTS)[0].status, 'resolved');
		});
	}

	it('dismiss closes the report as dismissed and revokes nothing', async (t) => {
		const w = await world(t, seed({ osionos_sessions: [{ id: 's1', user_id: TARGET, expires_at: FUTURE(), revoked_at: null, revoked_reason: null }] }));
		const answer = await decide(w, R1, { decision: 'dismiss' });
		assert.equal(answer.status, 200);
		assert.deepEqual([w.store.rows(REPORTS)[0].status, w.store.rows(REPORTS)[0].decision, w.store.rows(REPORTS)[0].decision_until], ['dismissed', 'dismiss', null]);
		assert.equal(writes(w, 'osionos_sessions').length, 0);
	});

	it('a message report decided ban moves nobody: no session revoked, no notice', async (t) => {
		const message = report(R1, { subject_kind: 'message', subject_id: randomUUID() });
		const w = await world(t, seed({ reports: [message], osionos_sessions: [{ id: 's1', user_id: TARGET, expires_at: FUTURE(), revoked_at: null, revoked_reason: null }] }));
		assert.equal((await decide(w, R1, { decision: 'ban' })).status, 200);
		assert.equal(w.store.rows('osionos_sessions')[0].revoked_at, null);
		assert.equal(w.store.rows(REPORTS)[0].decision, 'ban');
		await assert.doesNotReject(assertAccountNotRefused(createClient(w.store), TARGET, Date.now()));
	});

	const refusals = [
		['a report the moderator filed themselves', seed({ reports: [report(R1, { reporter_id: USER_A })] }), R1, { decision: 'ban' }, 403, 'self_report'],
		['an admin target (role grant)', seed({ grants: [{ userId: USER_A, role: 'admin' }, { userId: TARGET, role: 'admin' }] }), R1, { decision: 'ban' }, 403, 'target_is_admin'],
		['an admin target (identity flag)', seed({ osionos_bridge_identities: [{ user_id: TARGET, is_admin: true }] }), R1, { decision: 'ban' }, 403, 'target_is_admin'],
		['a decision the queue does not know', seed(), R1, { decision: 'shrug' }, 422, 'invalid_decision'],
		['a report that does not exist', seed(), R2, { decision: 'warn' }, 404, 'report_not_found'],
		['an id that is not a UUID', seed(), 'nope', { decision: 'warn' }, 422, 'invalid_report_id'],
	];
	for (const [name, tables, id, body, status, code] of refusals) {
		it(`refuses ${name} with ${status} ${code}: no audit row, no PATCH`, async (t) => {
			const w = await world(t, tables);
			const before = JSON.stringify(w.store.rows(REPORTS));
			const answer = await decide(w, id, body);
			assert.deepEqual([answer.status, answer.body.code], [status, code]);
			assert.equal(JSON.stringify(w.store.rows(REPORTS)), before);
			assert.equal(w.store.rows(AUDIT).length, 0);
			assert.equal(writes(w, REPORTS).length, 0);
		});
	}

	it('a user without the moderator role cannot decide, and the report is untouched', async (t) => {
		const w = await world(t);
		const answer = await decide(w, R1, { decision: 'ban' }, tokenFor(w.config, USER_B));
		assert.equal(answer.status, 403);
		assert.equal(writes(w, REPORTS).length, 0);
	});

	it('answers 503 audit_unavailable and leaves the row alone when the audit row cannot be written', async (t) => {
		const w = await world(t, seed(), { refuse: [AUDIT] });
		const answer = await decide(w, R1, { decision: 'ban' });
		assert.deepEqual([answer.status, answer.body.code], [503, 'audit_unavailable']);
		assert.equal(w.store.rows(REPORTS)[0].decision, null);
	});

	it('throttles writes: the 31st in a window is a 429', async (t) => {
		const w = await world(t);
		let last;
		for (let index = 0; index < 31; index += 1) last = await decide(w, R1, { decision: 'shrug' });
		assert.equal(last.status, 429);
	});
});

function createClient(store) {
	return createPg({ config: accountConfig(), env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl: store.fetchImpl }).asService();
}

const NOW = Date.parse('2026-10-23T12:00:00.000Z');
const row = (decision, until = null, kind = 'user') => report(R1, { decision, decision_until: until, subject_kind: kind });

describe('assertAccountNotRefused', () => {
	const cases = [
		['a ban', [row('ban')], 'account_banned'],
		['a ban beside a later warn', [row('ban'), report(R2, { decision: 'warn' })], 'account_banned'],
		['a suspension still running', [row('suspend', '2026-10-30T00:00:00.000Z')], 'account_suspended'],
		['a suspension with no end', [row('suspend')], 'account_suspended'],
		['a suspension that ended', [row('suspend', '2026-10-01T00:00:00.000Z')], null],
		['a dismissed report', [row('dismiss')], null],
		['a warning', [row('warn')], null],
		['a ban on a message report', [row('ban', null, 'message')], null],
		['no report at all', [], null],
		['another person\'s ban', [report(R1, { decision: 'ban', subject_user_id: USER_B })], null],
	];
	for (const [name, reports, code] of cases) {
		it(`${code ? `refuses with ${code}` : 'lets through'}: ${name}`, async () => {
			const client = createClient(createKeysetStore({ tables: { [REPORTS]: reports } }));
			const outcome = assertAccountNotRefused(client, TARGET, NOW);
			if (code) await assert.rejects(outcome, { status: 403, code });
			else await assert.doesNotReject(outcome);
		});
	}

	it('fails open when the read fails or there is no client (the spec Caveat)', async () => {
		await assert.doesNotReject(assertAccountNotRefused({ get: async () => { throw new Error('down'); } }, TARGET, NOW));
		await assert.doesNotReject(assertAccountNotRefused(null, TARGET, NOW));
	});

	it('puts the end of a suspension in the message', async () => {
		const client = createClient(createKeysetStore({ tables: { [REPORTS]: [row('suspend', '2026-10-30T00:00:00.000Z')] } }));
		await assert.rejects(assertAccountNotRefused(client, TARGET, NOW), /2026-10-30/);
	});
});

describe('the state is the most severe live decision, and only the same report lifts it', () => {
	it('ban R1, warn R2: refused; dismiss R1: signed in; the dismissal audit row names R1', async (t) => {
		const w = await world(t, seed({ reports: [report(R1), report(R2)] }));
		const config = { ...w.config, persistence: 'memory' };
		const pg = createPg({ config, env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl: w.store.fetchImpl });
		const handoff = () => createBridgeHandoff({ payload: validateBridgePayload({ provider: 'prismatica', subject: TARGET, email: 'c@example.com', name: 'C', jti: randomUUID() }), config, kv: kvStub(), pg, fetchImpl: async () => new Response('[]') });
		await decide(w, R1, { decision: 'ban' });
		await decide(w, R2, { decision: 'warn' });
		await assert.rejects(handoff(), { status: 403, code: 'account_banned' });
		await decide(w, R1, { decision: 'dismiss' });
		assert.equal((await handoff()).ok, true);
		const last = w.store.rows(AUDIT).at(-1);
		assert.deepEqual([last.details.reportId, last.details.decision], [R1, 'dismiss']);
	});
});

describe('every sign-in path asks the same function', () => {
	const banned = () => ({ ...seed({ reports: [report(R1, { decision: 'ban', status: 'resolved' })] }) });

	for (const [name, adminEmail] of [['the concurrent claim read', null], ['the in-order claim read (an env admin)', 'boss@example.com']]) {
		it(`the handoff refuses a banned person on ${name}`, async () => {
			const store = createKeysetStore({ tables: banned() });
			const config = { ...accountConfig(), adminEmails: adminEmail ? [adminEmail] : [] };
			const pg = createPg({ config, env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl: store.fetchImpl });
			const payload = validateBridgePayload({ provider: 'prismatica', subject: TARGET, email: adminEmail ?? 'c@example.com', name: 'C', jti: randomUUID(), ...(adminEmail ? { emailVerified: true } : {}) });
			await assert.rejects(createBridgeHandoff({ payload, config, kv: kvStub(), pg, fetchImpl: async () => new Response('[]') }), { status: 403, code: 'account_banned' });
		});
	}

	async function exchangeWith(t, tables) {
		const store = createKeysetStore({ tables });
		const config = { ...accountConfig(), publicApiKey: 'public-key', baasUrl: 'https://baas.local' };
		const pg = createPg({ config, env: { JWT_SECRET: ACCOUNT_JWT_SECRET }, fetchImpl: store.fetchImpl });
		const established = [];
		const fetchImpl = async () => new Response(JSON.stringify({ id: TARGET, email: 'c@example.com' }), { status: 200, headers: { 'content-type': 'application/json' } });
		const establishSession = async (input) => { established.push(input); return { persona: { email: 'c@example.com' }, session: { accessToken: 'a', refreshToken: 'r' } }; };
		const server = createServer(async (request, response) => {
			try {
				await handleAuthExchange(request, response, { config, kv: kvStub(), pg, fetchImpl, establishSession });
			} catch (error) {
				response.writeHead(error.status ?? 500, { 'content-type': 'application/json' }).end(JSON.stringify({ code: error.code }));
			}
		});
		await new Promise((done) => server.listen(0, '127.0.0.1', done));
		t.after(() => new Promise((done) => server.close(done)));
		const answer = await send(`http://127.0.0.1:${server.address().port}`, '/api/auth/exchange', { method: 'POST', body: { accessToken: gotrueJwt({ sub: TARGET }) } });
		return { answer, established };
	}

	it('the exchange refuses a banned person before the gateway is asked', async (t) => {
		const { answer, established } = await exchangeWith(t, banned());
		assert.deepEqual([answer.status, answer.body.code], [403, 'account_banned']);
		assert.equal(established.length, 0);
	});

	it('the exchange still signs a clean person in', async (t) => {
		const { answer, established } = await exchangeWith(t, seed({ reports: [] }));
		assert.equal(answer.status, 200);
		assert.equal(established.length, 1);
	});

	async function refreshAfter(t, report) {
		const keyset = createKeysetStore({ tables: { [REPORTS]: [] } });
		const sessions = createSessionStore({ rows: [] });
		const fetchImpl = (url, init) => (new URL(String(url)).pathname.endsWith(`/${REPORTS}`) ? keyset.fetchImpl(url, init) : sessions.fetchImpl(url, init));
		const { base } = await startSessionBridge({ t, store: { ...sessions, fetchImpl }, config: sessionConfig() });
		const { refreshToken } = await signIn(base, TARGET);
		keyset.rows(REPORTS).push(report);
		return refreshWith(base, refreshToken);
	}

	it('the refresh refuses a person banned after sign-in, without rotating the token', async (t) => {
		const answer = await refreshAfter(t, report(R1, { decision: 'ban' }));
		assert.deepEqual([answer.status, answer.body.code], [403, 'account_banned']);
	});

	it('the refresh lets a person whose suspension has ended continue', async (t) => {
		const answer = await refreshAfter(t, report(R1, { decision: 'suspend', decision_until: '2026-01-01T00:00:00.000Z' }));
		assert.equal(answer.status, 200);
	});
});

describe('the review conditions', () => {
	const unchanged = (w) => {
		assert.equal(writes(w, REPORTS).length, 0);
		assert.equal(w.store.rows(AUDIT).length, 0);
	};

	for (const [name, failReads] of [
		['the target role read fails', (table, params) => table === 'user_roles' && params.get('user_id') === `eq.${TARGET}`],
		['the target identity read fails', (table) => table === 'osionos_bridge_identities'],
	]) {
		it(`fails closed with 503 when ${name}: nothing is written`, async (t) => {
			const w = await world(t, seed(), { failReads });
			const answer = await decide(w, R1, { decision: 'ban' });
			assert.deepEqual([answer.status, answer.body.code], [503, 'admin_check_unavailable']);
			unchanged(w);
		});
	}

	const live = (decision, until = null) => seed({ reports: [report(R1, { decision, decision_until: until, status: 'resolved' })] });
	const downgrades = [
		['ban', null, 'warn', 409], ['ban', null, 'suspend', 409], ['ban', null, 'dismiss', 200], ['ban', null, 'ban', 200],
		['suspend', FUTURE(), 'warn', 409], ['suspend', FUTURE(), 'ban', 200], ['suspend', '2020-01-01T00:00:00.000Z', 'warn', 200],
	];
	for (const [current, until, next, status] of downgrades) {
		const extra = next === 'suspend' ? { until: FUTURE() } : {};
		it(`a ${until && until < '2021' ? 'lapsed ' : ''}${current} re-decided to ${next} answers ${status}`, async (t) => {
			const w = await world(t, live(current, until));
			const answer = await decide(w, R1, { decision: next, ...extra });
			assert.equal(answer.status, status);
			if (status === 409) {
				assert.equal(answer.body.code, 'decision_downgrade');
				assert.equal(w.store.rows(REPORTS)[0].decision, current);
				assert.equal(w.store.rows(AUDIT).length, 0);
			}
		});
	}

	it('a moderator cannot decide a report about themselves', async (t) => {
		const w = await world(t, seed({ reports: [report(R1, { subject_user_id: MODERATOR, subject_id: MODERATOR })] }));
		const answer = await decide(w, R1, { decision: 'dismiss' }, tokenFor(w.config, MODERATOR));
		assert.deepEqual([answer.status, answer.body.code], [403, 'self_subject']);
		unchanged(w);
	});

	it('a user report with no subject user is a 422 before any write', async (t) => {
		const w = await world(t, seed({ reports: [report(R1, { subject_user_id: null })] }));
		const answer = await decide(w, R1, { decision: 'ban' });
		assert.deepEqual([answer.status, answer.body.code], [422, 'invalid_subject']);
		unchanged(w);
	});

	it('the refusal read finds a live ban or suspension behind 101 lapsed suspensions', async () => {
		const lapsed = Array.from({ length: 101 }, (_, index) => report(`22222222-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`, { decision: 'suspend', decision_until: '2020-01-01T00:00:00.000Z' }));
		for (const [last, code] of [[row('ban'), 'account_banned'], [row('suspend', '2026-10-30T00:00:00.000Z'), 'account_suspended']]) {
			const client = createClient(createKeysetStore({ tables: { [REPORTS]: [...lapsed, last] } }));
			await assert.rejects(assertAccountNotRefused(client, TARGET, NOW), { status: 403, code });
		}
	});

	it('a handoff minted before a ban is refused when it is consumed, and writes no session row', async (t) => {
		const keyset = createKeysetStore({ tables: { [REPORTS]: [] } });
		const sessions = createSessionStore({ rows: [] });
		const fetchImpl = (url, init) => (new URL(String(url)).pathname.endsWith(`/${REPORTS}`) ? keyset.fetchImpl(url, init) : sessions.fetchImpl(url, init));
		const { base } = await startSessionBridge({ t, store: { ...sessions, fetchImpl }, config: sessionConfig() });
		const token = await mintHandoff(base, TARGET);
		keyset.rows(REPORTS).push(report(R1, { decision: 'ban' }));
		const answer = await postJson(base, '/api/auth/bridge/consume', { body: { token } });
		assert.deepEqual([answer.status, answer.body.code], [403, 'account_banned']);
		assert.equal(sessions.callsTo('osionos_sessions').filter((call) => call.method === 'POST').length, 0);
	});

	for (const [decision, table, code, extra] of [['ban', 'osionos_sessions', 'decision_saved_revoke_failed', {}], ['warn', 'osionos_notifications', 'decision_saved_notify_failed', {}]]) {
		it(`a failed ${table} write after the PATCH answers ${code}, the decision stays saved`, async (t) => {
			const w = await world(t, seed(), { refuse: [table] });
			const answer = await decide(w, R1, { decision, ...extra });
			assert.equal(answer.status, 500);
			assert.equal(answer.body.code, code);
			assert.equal(w.store.rows(REPORTS)[0].decision, decision);
		});
	}

	it('repeating a warn on the same report sends no second notice', async (t) => {
		const w = await world(t);
		await decide(w, R1, { decision: 'warn' });
		assert.equal((await decide(w, R1, { decision: 'warn' })).status, 200);
		assert.equal(w.store.rows('osionos_notifications').length, 1);
	});
});
