/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-export-emails.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The secondary addresses in the account data export: opened from the seal, never
 * the sealed columns, and a failure rather than a silent omission when they cannot open.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SECRET_NAME } from '../../scripts/bridge-account-export-archive.mjs';
import { LOOKUP_ENV, SEAL_ENV } from '../../scripts/bridge-account-email-rows.mjs';
import { createTtlKv } from './support/account-kv.mjs';
import { send, sudoToken, USER_A, USER_B } from './support/account-world.mjs';
import { EMAIL_KEYS, EXPORTS, createExportStore, sealedEmailRow, startExportWorld } from './support/account-export-world.mjs';

const TABLE = 'osionos_user_emails';
const COLUMNS = ['id', 'email', 'readable', 'created_at', 'verified_at'];
const ROW_KEYS = [...COLUMNS].sort();

async function setup(t, { rows = [], registry = [] } = {}) {
	const clock = { at: Date.parse('2026-10-23T12:00:00.000Z') };
	const kv = createTtlKv({ now: () => clock.at });
	const store = createExportStore({ registry, data: { [TABLE]: rows } });
	const world = await startExportWorld(t, { kv, store, clock });
	return { ...world, sudo: await sudoToken(world.config, kv, USER_A) };
}

async function runOne(world, format = 'json') {
	await send(world.base, '/api/account/export', { method: 'POST', token: world.sudo, body: { format } });
	await world.runner.tick();
	return world.store.tables.get(EXPORTS)[0];
}

const objectOf = (world, job) => world.store.objects.get(`account-exports/${job.id}.${job.format}`).buffer;
const tableOf = (world, job) => JSON.parse(objectOf(world, job)).tables[TABLE];
const verified = '2026-10-21T00:00:00.000Z';

describe('the export of secondary addresses', () => {
	it('E1 lists a verified and a pending address in clear, with exactly the documented columns', async (t) => {
		const rows = [await sealedEmailRow(USER_A, 'ada@example.com', { verifiedAt: verified }), await sealedEmailRow(USER_A, 'pending@example.com')];
		const world = await setup(t, { rows });
		const job = await runOne(world);
		assert.equal(job.status, 'done');
		const archive = JSON.parse(objectOf(world, job));
		assert.deepEqual(archive.manifest.tables[TABLE], 2);
		const exported = archive.tables[TABLE];
		assert.deepEqual(exported.map((row) => row.email).sort(), ['ada@example.com', 'pending@example.com']);
		for (const row of exported) {
			assert.deepEqual(Object.keys(row).sort(), ROW_KEYS);
			assert.equal(row.readable, true);
		}
		assert.equal(exported.find((row) => row.email === 'pending@example.com').verified_at, null);
		assert.equal(exported.find((row) => row.email === 'ada@example.com').verified_at, verified);
	});
	for (const format of ['json', 'csv', 'zip']) {
		it(`E2 never carries the sealed columns into the ${format} artifact`, async (t) => {
			const rows = [await sealedEmailRow(USER_A, 'ada@example.com')];
			assert.ok(rows[0].email_enc.length > 20 && rows[0].email_hmac.length > 20);
			const world = await setup(t, { rows });
			const job = await runOne(world, format);
			assert.equal(job.status, 'done');
			const raw = objectOf(world, job).toString('latin1');
			assert.ok(raw.includes('ada@example.com'));
			assert.ok(!raw.includes(rows[0].email_enc) && !raw.includes(rows[0].email_hmac));
		});
	}
	it('E3 scopes the read to the caller and leaves another user\'s address out', async (t) => {
		const rows = [await sealedEmailRow(USER_A, 'ada@example.com'), await sealedEmailRow(USER_B, 'bob@example.com')];
		const world = await setup(t, { rows });
		const job = await runOne(world);
		assert.deepEqual(tableOf(world, job).map((row) => row.email), ['ada@example.com']);
		assert.doesNotMatch(objectOf(world, job).toString(), /bob@example\.com/);
		assert.ok(world.store.calls.some((call) => call.path.endsWith(TABLE) && call.search.includes(`user_id=eq.${USER_A}`)));
	});
	it('E4 fails with export_sealed_unavailable, and stores nothing, when rows exist and the keys are unset', async (t) => {
		const rows = [await sealedEmailRow(USER_A, 'ada@example.com')];
		const world = await setup(t, { rows });
		delete world.env[SEAL_ENV];
		delete world.env[LOOKUP_ENV];
		const job = await runOne(world);
		assert.equal(job.status, 'failed');
		assert.equal(job.error_code, 'export_sealed_unavailable');
		assert.deepEqual([world.store.puts, world.store.buckets, world.store.objects.size], [0, 0, 0]);
	});
	it('E4b fails when the keys are malformed even though the rows still open', async (t) => {
		const short = { ...EMAIL_KEYS, [LOOKUP_ENV]: 'short' };
		const world = await setup(t, { rows: [await sealedEmailRow(USER_A, 'ada@example.com', { env: short })] });
		world.env[LOOKUP_ENV] = short[LOOKUP_ENV];
		const job = await runOne(world);
		assert.equal(job.error_code, 'export_sealed_unavailable');
		assert.equal(world.store.puts, 0);
	});
	it('E5 exports an empty table, and succeeds, when there are no rows and no keys', async (t) => {
		const world = await setup(t);
		delete world.env[SEAL_ENV];
		delete world.env[LOOKUP_ENV];
		const job = await runOne(world);
		assert.equal(job.status, 'done');
		const archive = JSON.parse(objectOf(world, job));
		assert.deepEqual(archive.tables[TABLE], []);
		assert.equal(archive.manifest.tables[TABLE], 0);
	});
	it('E6 marks only the row that does not open as unreadable', async (t) => {
		const good = await sealedEmailRow(USER_A, 'ada@example.com');
		const bad = { ...(await sealedEmailRow(USER_A, 'eve@example.com')), email_hmac: 'ab'.repeat(32) };
		const world = await setup(t, { rows: [good, bad] });
		const job = await runOne(world);
		assert.equal(job.status, 'done');
		const exported = tableOf(world, job);
		assert.deepEqual(exported.find((row) => row.id === good.id), { id: good.id, email: 'ada@example.com', readable: true, created_at: good.created_at, verified_at: null });
		assert.deepEqual(exported.find((row) => row.id === bad.id), { id: bad.id, email: null, readable: false, created_at: bad.created_at, verified_at: null });
	});
	it('E6b fails when every row fails to open under well-formed keys', async (t) => {
		const rows = [await sealedEmailRow(USER_A, 'ada@example.com', { env: { ...EMAIL_KEYS, [LOOKUP_ENV]: 'w'.repeat(40) } })];
		const world = await setup(t, { rows });
		const job = await runOne(world);
		assert.equal(job.status, 'failed');
		assert.equal(job.error_code, 'export_sealed_unavailable');
		assert.equal(world.store.puts, 0);
	});
	it('E7 prefixes a formula-looking address in the CSV', async (t) => {
		const world = await setup(t, { rows: [await sealedEmailRow(USER_A, '=x@example.com')] });
		const job = await runOne(world, 'csv');
		assert.match(objectOf(world, job).toString(), /'=x@example\.com/);
	});
	it('E8 exports no column named like a secret', async (t) => {
		const world = await setup(t, { rows: [await sealedEmailRow(USER_A, 'ada@example.com')] });
		const job = await runOne(world);
		const exported = tableOf(world, job);
		assert.deepEqual(Object.keys(exported[0]), COLUMNS);
		assert.deepEqual(Object.keys(exported[0]).filter((key) => SECRET_NAME.test(key)), []);
	});
	it('E9 refuses a registry row that names the addresses table, before any data read', async (t) => {
		const entry = { table_name: TABLE, column_name: 'user_id', export_columns: ['id'] };
		const world = await setup(t, { rows: [await sealedEmailRow(USER_A, 'ada@example.com')], registry: [entry] });
		const job = await runOne(world);
		assert.equal(job.status, 'failed');
		assert.equal(job.error_code, 'export_forbidden_column');
		assert.deepEqual(world.store.calls.filter((call) => call.path.endsWith(TABLE)), []);
	});
	it('E10 exports an empty table when the database has no addresses table', async (t) => {
		const world = await setup(t);
		world.store.tables.delete(TABLE);
		const job = await runOne(world);
		assert.equal(job.status, 'done');
		assert.deepEqual(tableOf(world, job), []);
	});

	it('E11 fails the job, and stores nothing, when the addresses read fails for another reason', async (t) => {
		const world = await setup(t, { rows: [await sealedEmailRow(USER_A, 'ada@example.com')] });
		world.store.fail.table = TABLE;
		const job = await runOne(world);
		assert.ok(world.store.calls.some((call) => call.path.endsWith(TABLE)), 'the addresses table was read');
		assert.equal(job.status, 'failed');
		assert.equal(world.store.puts, 0);
	});
});
