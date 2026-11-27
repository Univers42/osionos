// The node's remembered computers (devil verdict 2026-11-01, Amendment 1, R4, R5 as overridden by
// groot ADR 0041, R7, R8): a hash per device secret, bound to owner, machine and app origin, in a
// 0600 file; 12 hours idle, 30 days absolute (devil 2026-11-27, TB7), at most 8.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REMEMBER_LIMITS, createRememberedComputers, deviceHash, readRememberedSummary } from '../../packages/osionos-node/remembered-computers.mjs';

const OWNER = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const MACHINE = 'm-abcdefghijklmnop';
const PROD = 'https://baas.tail10f2ea.ts.net:8443';
const BETA = 'https://baas-beta.tail10f2ea.ts.net';
const DAY = 86_400_000;

function world(t, over = {}) {
	const dir = mkdtempSync(join(tmpdir(), 'remembered-'));
	chmodSync(dir, 0o700);
	const clock = { at: 1_800_000_000_000 };
	const file = join(dir, 'remembered-computers.json');
	const make = (more = {}) => createRememberedComputers({ file, owner: OWNER, machine: MACHINE, origins: [PROD, BETA], now: () => clock.at, ...over, ...more });
	return { file, clock, make, store: make() };
}

const HOUR = 3_600_000;

test('TB7: 12 hours idle opens and slides; 12 hours and 1 ms idle is refused and dropped', (t) => {
	const { clock, store } = world(t);
	const secret = store.issue(PROD);
	assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
	clock.at += 12 * HOUR;
	assert.equal(store.open(secret, PROD), true);
	clock.at += 12 * HOUR;
	assert.equal(store.open(secret, PROD), true, 'the use slid the idle window');
	clock.at += 12 * HOUR + 1;
	assert.equal(store.open(secret, PROD), false);
	assert.equal(store.count(), 0);
	assert.equal(REMEMBER_LIMITS.idleMs, 12 * HOUR);
});

test('TB7: 30 days from its issue it still opens; 30 days and 1 ms is refused, however often it was used', (t) => {
	const { clock, store } = world(t);
	const issuedAt = clock.at;
	const secret = store.issue(PROD);
	while (clock.at + 11 * HOUR < issuedAt + 30 * DAY) {
		clock.at += 11 * HOUR;
		assert.equal(store.open(secret, PROD), true);
	}
	clock.at = issuedAt + 30 * DAY;
	assert.equal(store.open(secret, PROD), true, 'exactly 30 days');
	clock.at += 1;
	assert.equal(store.open(secret, PROD), false);
	assert.equal(REMEMBER_LIMITS.absoluteMs, 30 * DAY);
});

test('TB7: a record on disk is judged again at load, at both limits, to the millisecond', (t) => {
	const { clock, file, make } = world(t);
	const at = clock.at;
	const record = (hash, createdAt, lastUsedAt) => ({ hash: hash.repeat(64), owner: OWNER, machine: MACHINE, appOrigin: PROD, createdAt, lastUsedAt });
	writeFileSync(file, JSON.stringify({ computers: [
		record('a', at - DAY, at - 12 * HOUR),
		record('b', at - DAY, at - 12 * HOUR - 1),
		record('c', at - 30 * DAY, at),
		record('d', at - 30 * DAY - 1, at),
	] }), { mode: 0o600 });
	make();
	assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).computers.map((kept) => kept.hash[0]), ['a', 'c']);
});

test('TB8: touch slides only a live record it still holds, and never writes after forget, clear or expiry', (t) => {
	const { clock, file, store } = world(t);
	const secret = store.issue(PROD);
	const hash = deviceHash(secret);
	clock.at += 11 * HOUR;
	store.touch(hash);
	clock.at += 11 * HOUR;
	assert.equal(store.open(secret, PROD), true, 'the touch slid the idle window');
	const createdAt = JSON.parse(readFileSync(file, 'utf8')).computers[0].createdAt;
	store.touch(hash);
	assert.equal(JSON.parse(readFileSync(file, 'utf8')).computers[0].createdAt, createdAt, 'createdAt never moves');

	store.forget(secret);
	store.touch(hash);
	assert.equal(existsSync(file), false, 'after forget');

	const again = store.issue(PROD);
	store.clear();
	store.touch(deviceHash(again));
	assert.equal(existsSync(file), false, 'after clear');

	const stale = store.issue(PROD);
	clock.at += 12 * HOUR + 1;
	store.touch(deviceHash(stale));
	assert.equal(store.open(stale, PROD), false, 'a touch does not revive an expired record');
	assert.equal(existsSync(file), false, 'after expiry');
	store.touch('not a hash');
});

test('TB23: the summary reads counts, origins and ages, never a hash, and writes nothing', (t) => {
	const { clock, file, store } = world(t);
	store.issue(PROD);
	clock.at += HOUR;
	store.issue(BETA);
	const before = readFileSync(file, 'utf8');
	const summary = readRememberedSummary(file, clock.at);
	assert.deepEqual(summary, [{ appOrigin: PROD, idleMs: HOUR, ageMs: HOUR }, { appOrigin: BETA, idleMs: 0, ageMs: 0 }]);
	assert.equal(JSON.stringify(summary).includes(JSON.parse(before).computers[0].hash), false);
	assert.equal(readFileSync(file, 'utf8'), before);
	assert.deepEqual(readRememberedSummary(join(file, 'missing'), clock.at), []);
});

test('R7: a 9th record evicts the oldest', (t) => {
	const { clock, store } = world(t);
	const secrets = [];
	for (let index = 0; index < 9; index += 1) {
		secrets.push(store.issue(PROD));
		clock.at += 1000;
	}
	assert.equal(store.count(), 8);
	assert.equal(store.open(secrets[0], PROD), false, 'the first issued is gone');
	for (const secret of secrets.slice(1)) assert.equal(store.open(secret, PROD), true);
});

test('R7: the file is 0600, holds the hash and its binding, and never the secret', (t) => {
	const { file, store } = world(t);
	const secret = store.issue(BETA);
	assert.equal(statSync(file).mode & 0o777, 0o600);
	const text = readFileSync(file, 'utf8');
	assert.equal(text.includes(secret), false);
	const [record] = JSON.parse(text).computers;
	assert.deepEqual(Object.keys(record).sort(), ['appOrigin', 'createdAt', 'hash', 'lastUsedAt', 'machine', 'owner']);
	assert.equal(record.hash, createHash('sha256').update(secret).digest('hex'));
	assert.deepEqual([record.owner, record.machine, record.appOrigin], [OWNER, MACHINE, BETA]);
});

test('R7: a restart reads the same records back', (t) => {
	const { make, store } = world(t);
	const secret = store.issue(PROD);
	assert.equal(make().open(secret, PROD), true);
});

test('R4: a secret opens only under the app origin it was issued to (production and the beta, both ways)', (t) => {
	const { store } = world(t);
	const prod = store.issue(PROD);
	const beta = store.issue(BETA);
	assert.equal(store.open(prod, BETA), false);
	assert.equal(store.open(beta, PROD), false);
	assert.equal(store.open(prod, PROD), true, 'a refusal under another origin does not burn it');
	assert.equal(store.open(beta, BETA), true);
});

test('R5 (overridden, ADR 0041): an origin outside the remember list gets no secret; leaving the list deletes its records', (t) => {
	const { make, store } = world(t);
	assert.equal(store.issue('https://elsewhere.example'), null);
	assert.equal(store.issue('app://osionos'), null);
	const beta = store.issue(BETA);
	const prod = store.issue(PROD);
	const narrowed = make({ origins: [PROD] });
	assert.equal(narrowed.count(), 1);
	assert.equal(narrowed.open(beta, BETA), false);
	assert.equal(narrowed.open(prod, PROD), true);
	assert.equal(make({ origins: [PROD, BETA] }).open(beta, BETA), false, 'deleted, not hidden');
});

test('R8: forget and clear delete; a record of another owner or machine (a re-pair) is dropped on load', (t) => {
	const { file, make, store } = world(t);
	const first = store.issue(PROD);
	const second = store.issue(PROD);
	store.forget(first);
	assert.equal(store.open(first, PROD), false);
	assert.equal(make({ owner: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb' }).count(), 0, 'another owner');
	assert.equal(make().open(second, PROD), false, 'the re-pair deleted it');
	make().issue(PROD);
	make({ machine: 'm-ponmlkjihgfedcba' });
	assert.equal(make().count(), 0, 'another machine');
	const kept = make();
	kept.issue(PROD);
	kept.clear();
	assert.equal(existsSync(file), false);
});

test('R11: a missing, corrupt or shared file remembers nothing, and never throws', (t) => {
	const { file, make } = world(t);
	assert.equal(make().count(), 0);
	writeFileSync(file, 'not json', { mode: 0o600 });
	assert.equal(make().count(), 0);
	const secret = make().issue(PROD);
	chmodSync(file, 0o644);
	assert.equal(make().open(secret, PROD), false, 'a file others can read is not trusted');
	assert.equal(make().open('A'.repeat(43), PROD), false);
	assert.equal(make().open(42, PROD), false);
});
