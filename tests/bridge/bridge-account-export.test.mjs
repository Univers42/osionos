/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-export.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The account data export end to end: the routes (sudo, limits, isolation, download
 * states) and the worker (what it reads, what it refuses, how it fails), over one fake
 * that plays PostgREST and the storage router. The archive rules alone are in
 * bridge-account-export-archive.test.mjs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EXPORT_MAX_BYTES, SECRET_NAME } from '../../scripts/bridge-account-export-archive.mjs';
import { createTtlKv } from './support/account-kv.mjs';
import { send, sessionToken, sudoToken, USER_A, USER_B } from './support/account-world.mjs';
import { AUDIT, EXPORTS, createExportStore, startExportWorld } from './support/account-export-world.mjs';

const REGISTRY = [
	{ table_name: 'osionos_profiles', column_name: 'user_id', export_columns: ['user_id', 'display_name'] },
	{ table_name: 'osionos_notes', column_name: 'owner_id', export_columns: ['id', 'owner_id', 'title'] },
	{ table_name: 'osionos_connections', column_name: 'requester_id', export_columns: ['requester_id', 'status'] },
];
const note = (index, owner = USER_A, title = `note ${index}`) => ({ id: String(index).padStart(6, '0'), owner_id: owner, title });
const DATA = {
	osionos_profiles: [{ user_id: USER_A, display_name: 'Ada' }, { user_id: USER_B, display_name: 'Bob' }],
	osionos_notes: [note(1), note(2, USER_B, 'bob private')],
	osionos_connections: [{ requester_id: USER_B, addressee_id: USER_A, status: 'accepted' }, { requester_id: USER_B, addressee_id: randomUUID(), status: 'accepted' }],
};
const DAY = 24 * 60 * 60 * 1000;
const base = (extra = {}) => ({ id: randomUUID(), user_id: USER_A, format: 'json', status: 'done', requested_at: '2026-10-20T00:00:00.000Z', bytes: 10, ...extra });

async function setup(t, { exports = [], registry = REGISTRY, data = DATA } = {}) {
	const clock = { at: Date.parse('2026-10-23T12:00:00.000Z') };
	const kv = createTtlKv({ now: () => clock.at });
	const store = createExportStore({ exports, registry, data });
	const world = await startExportWorld(t, { kv, store, clock });
	const sudo = await sudoToken(world.config, kv, USER_A);
	return { ...world, kv, sudo, plain: sessionToken(world.config, USER_A), other: sessionToken(world.config, USER_B) };
}

const ask = (world, format, token = world.sudo) => send(world.base, '/api/account/export', { method: 'POST', token, body: format ? { format } : {} });
const jobs = (world) => world.store.tables.get(EXPORTS);
const failedOf = (world) => jobs(world).find((job) => job.status === 'failed');

describe('POST /api/account/export', () => {
	it('needs a step-up proof', async (t) => {
		const world = await setup(t);
		const answer = await ask(world, 'json', world.plain);
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'sudo_required');
		assert.equal(jobs(world).length, 0);
	});
	it('queues a job after the audit row, and answers 202 with its id', async (t) => {
		const world = await setup(t);
		const answer = await ask(world, 'csv');
		assert.equal(answer.status, 202);
		assert.deepEqual(answer.body, { id: jobs(world)[0].id, status: 'queued' });
		assert.deepEqual(world.store.order, ['audit:account.export_requested', `insert:${EXPORTS}`]);
		assert.equal(jobs(world)[0].format, 'csv');
	});
	it('defaults to zip and refuses a format it does not know', async (t) => {
		const world = await setup(t);
		assert.equal((await ask(world, undefined)).status, 202);
		assert.equal(jobs(world)[0].format, 'zip');
		const bad = await ask(world, 'xml');
		assert.equal(bad.status, 422);
		assert.equal(bad.body.code, 'invalid_format');
	});
	it('is refused with 503 and creates no job when the audit store is down', async (t) => {
		const world = await setup(t);
		world.store.fail.audit = true;
		const answer = await ask(world, 'json');
		assert.equal(answer.status, 503);
		assert.equal(answer.body.code, 'audit_unavailable');
		assert.equal(jobs(world).length, 0);
	});
	it('answers 409 with the open job id on a second request', async (t) => {
		const world = await setup(t);
		const first = await ask(world, 'json');
		const second = await ask(world, 'json');
		assert.equal(second.status, 409);
		assert.equal(second.body.code, 'export_in_progress');
		assert.equal(second.body.id, first.body.id);
		assert.equal(jobs(world).length, 1);
	});
	it('answers 429 with retryAfterSeconds on the fourth request of a day', async (t) => {
		const world = await setup(t);
		for (let attempt = 0; attempt < 3; attempt += 1) await ask(world, 'json');
		const fourth = await ask(world, 'json');
		assert.equal(fourth.status, 429);
		assert.equal(fourth.body.retryAfterSeconds, DAY / 1000);
	});
});

describe('reading a job', () => {
	it('lists only the caller\'s jobs and never shows an owner or an object key', async (t) => {
		const mine = base();
		const world = await setup(t, { exports: [mine, base({ user_id: USER_B })] });
		const list = await send(world.base, '/api/account/export', { token: world.plain });
		assert.deepEqual(list.body.exports.map((job) => job.id), [mine.id]);
		assert.doesNotMatch(list.text, /object_key|user_id|objectKey/);
	});
	it('answers a job of somebody else exactly like an unknown id', async (t) => {
		const theirs = base({ user_id: USER_B });
		const world = await setup(t, { exports: [theirs] });
		const foreign = await send(world.base, `/api/account/export/${theirs.id}`, { token: world.plain });
		const unknown = await send(world.base, `/api/account/export/${randomUUID()}`, { token: world.plain });
		const garbage = await send(world.base, '/api/account/export/not-a-uuid', { token: world.plain });
		assert.equal(foreign.status, 404);
		assert.equal(foreign.text, unknown.text);
		assert.equal(garbage.text, unknown.text);
		const download = await send(world.base, `/api/account/export/${theirs.id}/download`, { token: world.plain });
		assert.equal(download.text, unknown.text);
	});
});

describe('the owner filter', () => {
	it('carries user_id=eq.<caller> in every job read, on top of the role', async (t) => {
		const world = await setup(t, { exports: [base()] });
		await send(world.base, '/api/account/export', { token: world.plain });
		const reads = world.store.calls.filter((call) => call.method === 'GET' && call.path.endsWith(`/${EXPORTS}`));
		assert.equal(reads.length, 1);
		assert.equal(new URLSearchParams(reads[0].search).get('user_id'), `eq.${USER_A}`);
	});
});

describe('GET /api/account/export/:id/download', () => {
	const gets = (world) => world.store.calls.filter((call) => call.method === 'GET' && call.path.includes('/object/'));
	const get = (world, job) => send(world.base, `/api/account/export/${job.id}/download`, { token: world.plain });
	it('is refused before the job is done', async (t) => {
		const job = base({ status: 'running' });
		const world = await setup(t, { exports: [job] });
		const answer = await get(world, job);
		assert.equal(answer.status, 409);
		assert.equal(answer.body.code, 'export_not_ready');
	});
	it('is gone once expired, by status or by date, without touching storage', async (t) => {
		const byStatus = base({ status: 'expired' });
		const byDate = base({ expires_at: '2026-10-23T11:59:59.000Z' });
		const world = await setup(t, { exports: [byStatus, byDate] });
		for (const job of [byStatus, byDate]) assert.equal((await get(world, job)).status, 410);
		assert.equal(gets(world).length, 0);
	});
	it('is refused before the get when the object is over the cap', async (t) => {
		const over = base({ bytes: EXPORT_MAX_BYTES + 1, expires_at: '2026-10-30T00:00:00.000Z' });
		const world = await setup(t, { exports: [over] });
		const answer = await get(world, over);
		assert.equal(answer.status, 413);
		assert.equal(gets(world).length, 0);
	});
	it('sends the object as a private attachment and audits the download', async (t) => {
		const job = base({ expires_at: '2026-10-30T00:00:00.000Z' });
		const world = await setup(t, { exports: [job] });
		world.store.objects.set(`account-exports/${job.id}.json`, { type: 'application/json', buffer: Buffer.from('{"ok":true}') });
		const answer = await get(world, job);
		assert.equal(answer.status, 200);
		assert.equal(answer.text, '{"ok":true}');
		assert.match(answer.headers.get('content-disposition'), /^attachment;/);
		assert.equal(answer.headers.get('cache-control'), 'private, no-store');
		assert.equal(answer.headers.get('x-content-type-options'), 'nosniff');
		assert.ok(world.store.order.includes('audit:account.export_downloaded'));
	});
});

/** Every key of a parsed JSON value, at any depth. */
function keysOf(value, found = new Set()) {
	if (Array.isArray(value)) value.forEach((item) => keysOf(item, found));
	else if (value && typeof value === 'object') for (const [key, inner] of Object.entries(value)) { found.add(key); keysOf(inner, found); }
	return found;
}

async function runOne(world, format = 'json') {
	await ask(world, format);
	await world.runner.tick();
	return jobs(world)[0];
}

describe('the worker', () => {
	it('exports the caller\'s rows only, with both ends of a connection, and marks the job done after the put', async (t) => {
		const world = await setup(t);
		const job = await runOne(world);
		assert.equal(job.status, 'done');
		assert.ok(Date.parse(job.expires_at) - world.clock.at === 7 * DAY);
		const object = world.store.objects.get(`account-exports/${job.id}.json`);
		assert.equal(object.owner, USER_A);
		assert.equal(object.buffer.length, job.bytes);
		const { manifest, tables } = JSON.parse(object.buffer);
		assert.deepEqual(manifest.tables, { osionos_connections: 1, osionos_notes: 1, osionos_profiles: 1 });
		assert.doesNotMatch(object.buffer.toString(), /bob private|Bob/);
		assert.equal(tables.osionos_connections[0].addressee_id, USER_A);
	});
	it('creates the bucket before the first put and puts exactly once', async (t) => {
		const world = await setup(t);
		await runOne(world, 'zip');
		assert.ok(world.store.order.indexOf('bucket') < world.store.order.indexOf('put'));
		assert.equal(world.store.puts, 1);
	});
	it('never carries a secret-looking key or an object key into the archive or the job', async (t) => {
		const world = await setup(t);
		const job = await runOne(world);
		const archive = JSON.parse(world.store.objects.get(`account-exports/${job.id}.json`).buffer);
		const found = [...keysOf(archive.tables)].filter((key) => SECRET_NAME.test(key) || key === 'object_key');
		assert.deepEqual(found, []);
		const status = await send(world.base, `/api/account/export/${job.id}`, { token: world.plain });
		assert.deepEqual([...keysOf(status.body)].filter((key) => SECRET_NAME.test(key) || key === 'object_key'), []);
	});
	it('reads every page of a large table', async (t) => {
		const many = Array.from({ length: 1200 }, (_, index) => note(index + 1));
		const world = await setup(t, { data: { ...DATA, osionos_notes: many } });
		const job = await runOne(world);
		assert.equal(JSON.parse(world.store.objects.get(`account-exports/${job.id}.json`).buffer).manifest.tables.osionos_notes, 1200);
	});
	it('completes a 5 MB export', async (t) => {
		const big = Array.from({ length: 5 }, (_, index) => ({ ...note(index + 1), title: 'x'.repeat(1024 * 1024) }));
		const world = await setup(t, { data: { ...DATA, osionos_notes: big } });
		const job = await runOne(world);
		assert.equal(job.status, 'done');
		assert.ok(job.bytes > 5 * 1024 * 1024);
	});
	it('fails with export_too_large over the cap, with no put and nothing truncated', async (t) => {
		const huge = Array.from({ length: 60 }, (_, index) => ({ ...note(index + 1), title: 'y'.repeat(1024 * 1024) }));
		const world = await setup(t, { data: { ...DATA, osionos_notes: huge } });
		const job = await runOne(world);
		assert.equal(job.status, 'failed');
		assert.equal(job.error_code, 'export_too_large');
		assert.equal(world.store.puts, 0);
		assert.equal(job.bytes, undefined);
	});
	it('marks the job failed, never done, when storage fails', async (t) => {
		const world = await setup(t);
		world.store.fail.putAfter = 0;
		await ask(world, 'json');
		await world.runner.tick();
		assert.equal(failedOf(world).error_code, 'export_storage_failed');
		assert.equal(jobs(world).some((job) => job.status === 'done'), false);
		assert.equal(world.store.objects.size, 0);
	});
	for (const [label, entry] of [
		['a table name outside the identifier rule', { table_name: '../evil', column_name: 'owner_id', export_columns: ['id'] }],
		['a column named like a secret', { table_name: 'osionos_notes', column_name: 'owner_id', export_columns: ['id', 'password_hash'] }],
	]) {
		it(`rejects ${label} before any data request`, async (t) => {
			const world = await setup(t, { registry: [...REGISTRY, entry] });
			await runOne(world);
			assert.equal(failedOf(world).status, 'failed');
			assert.match(failedOf(world).error_code, /^export_(bad_identifier|forbidden_column)$/);
			assert.deepEqual(world.store.calls.filter((call) => /osionos_(profiles|notes|connections)/.test(call.path)), []);
			assert.equal(world.store.puts, 0);
		});
	}
	it('never exports a blocked pair, whichever side blocked', async (t) => {
		const connections = [
			{ requester_id: USER_B, addressee_id: USER_A, status: 'blocked' },
			{ requester_id: USER_A, addressee_id: USER_B, status: 'blocked' },
			{ requester_id: USER_A, addressee_id: randomUUID(), status: 'accepted' },
		];
		const world = await setup(t, { data: { ...DATA, osionos_connections: connections } });
		const job = await runOne(world);
		const archive = JSON.parse(world.store.objects.get(`account-exports/${job.id}.json`).buffer);
		assert.deepEqual(archive.tables.osionos_connections.map((row) => row.status), ['accepted']);
	});
	it('fails a job whose registry exports a peer-role row of an unknown table, before any data request', async (t) => {
		const peer = { table_name: 'osionos_notifications', column_name: 'actor_id', role: 'peer', export_columns: ['id', 'actor_id'] };
		const world = await setup(t, { registry: [...REGISTRY, peer], data: { ...DATA, osionos_notifications: [] } });
		await runOne(world);
		assert.equal(failedOf(world).error_code, 'export_forbidden_column');
		assert.deepEqual(world.store.calls.filter((call) => /osionos_(profiles|notes|connections|notifications)/.test(call.path)), []);
	});
	it('exports a table in full when the server caps every response at 100 rows', async (t) => {
		const many = Array.from({ length: 1200 }, (_, index) => note(index + 1));
		const world = await setup(t, { data: { ...DATA, osionos_notes: many } });
		world.store.fail.pageCap = 100;
		const job = await runOne(world);
		assert.equal(job.status, 'done');
		assert.equal(JSON.parse(world.store.objects.get(`account-exports/${job.id}.json`).buffer).manifest.tables.osionos_notes, 1200);
	});
	it('deletes the object it just stored when the done write fails', async (t) => {
		const world = await setup(t);
		world.store.fail.donePatch = true;
		await ask(world, 'json');
		await world.runner.tick();
		assert.equal(world.store.puts, 1);
		assert.equal(world.store.objects.size, 0);
		assert.equal(jobs(world)[0].status, 'failed');
	});
	it('deletes the object and marks a job expired once its time has passed', async (t) => {
		const job = base({ expires_at: '2026-10-23T11:00:00.000Z' });
		const world = await setup(t, { exports: [job] });
		world.store.objects.set(`account-exports/${job.id}.json`, { type: 'application/json', buffer: Buffer.from('{}') });
		await world.runner.tick();
		assert.equal(jobs(world)[0].status, 'expired');
		assert.equal(world.store.objects.size, 0);
	});
	it('leaves the audit table alone while it works', async (t) => {
		const world = await setup(t);
		await runOne(world);
		assert.equal(world.store.tables.get(AUDIT).length, 1);
	});
});
