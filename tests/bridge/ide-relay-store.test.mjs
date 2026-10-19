// The relay's agent registry (contract 5.4, D2): one JSON file, single writer, write-temp + fsync +
// rename. Every test gets its own temp directory; the stage-0 path is never used.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs';
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAgentStore, StoreError } from '../../scripts/ide-relay-store.mjs';
import { newAgentId, fingerprint } from '../../scripts/ide-agent-frames.mjs';

const SUB_A = '11111111-1111-4111-8111-111111111111';
const SUB_B = '22222222-2222-4222-8222-222222222222';

const record = (overrides = {}) => {
	const pubkey = Buffer.alloc(32, Math.floor(Math.random() * 200)).toString('base64url');
	return {
		agent_id: newAgentId(), sub: SUB_A, pubkey, fp: fingerprint(Buffer.from(pubkey, 'base64url')),
		name: 'laptop', os_user: 'dylan', platform: 'linux-x64', created_at: new Date(0).toISOString(),
		rotated_at: null, last_seen_at: null, ...overrides,
	};
};

let dir; let path;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ide-relay-store-')); path = join(dir, 'state', 'agents.json'); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('persistence', () => {
	it('starts empty when the file is absent and creates the directory on the first write', () => {
		const store = openAgentStore({ path });
		assert.deepEqual(store.list(), []);
		store.add(record());
		assert.equal(statSync(path).mode & 0o777, 0o600);
		assert.equal(JSON.parse(readFileSync(path, 'utf8')).v, 1);
	});
	it('a second store on the same file sees what the first wrote', () => {
		const rec = record();
		openAgentStore({ path }).add(rec);
		assert.deepEqual(openAgentStore({ path }).get(rec.agent_id), rec);
	});
	it('leaves no temp file behind', () => {
		const store = openAgentStore({ path });
		store.add(record()); store.add(record());
		assert.deepEqual(readdirSync(join(dir, 'state')), ['agents.json']);
	});
	it('a failed rename keeps the old file intact and rolls memory back', () => {
		const first = record();
		const store = openAgentStore({ path });
		store.add(first);
		const before = readFileSync(path, 'utf8');
		const failing = openAgentStore({ path, fsImpl: { ...realFs, renameSync: () => { throw new Error('disk full'); } } });
		assert.throws(() => failing.add(record()), /disk full/);
		assert.equal(readFileSync(path, 'utf8'), before);
		assert.equal(failing.list().length, 1);
	});
});

describe('refusing a bad file', () => {
	const bad = {
		'not JSON': '{nope',
		'wrong version': JSON.stringify({ v: 2, agents: [] }),
		'agents not a list': JSON.stringify({ v: 1, agents: {} }),
		'record with a short key': JSON.stringify({ v: 1, agents: [{ ...record(), pubkey: 'AAAA' }] }),
		'record with a bad name': JSON.stringify({ v: 1, agents: [{ ...record(), name: '../x' }] }),
		'record with a non-uuid sub': JSON.stringify({ v: 1, agents: [{ ...record(), sub: 'abc' }] }),
	};
	for (const [label, text] of Object.entries(bad)) {
		it(`${label} stops the start and names the file`, () => {
			realFs.mkdirSync(join(dir, 'state'));
			writeFileSync(path, text);
			assert.throws(() => openAgentStore({ path }), (error) => error instanceof StoreError && error.message.includes(path));
		});
	}
	it('duplicate agent ids stop the start', () => {
		const rec = record();
		realFs.mkdirSync(join(dir, 'state'));
		writeFileSync(path, JSON.stringify({ v: 1, agents: [rec, rec] }));
		assert.throws(() => openAgentStore({ path }), StoreError);
	});
});

describe('records', () => {
	it('refuses a 65th record and a duplicate id', () => {
		const store = openAgentStore({ path });
		const first = record();
		store.add(first);
		assert.throws(() => store.add({ ...first }), /exists/);
		for (let i = 1; i < 64; i++) store.add(record());
		assert.throws(() => store.add(record()), /full/);
	});
	it('groups by sub and counts per sub', () => {
		const store = openAgentStore({ path });
		store.add(record()); store.add(record()); store.add(record({ sub: SUB_B }));
		assert.equal(store.countFor(SUB_A), 2);
		assert.equal(store.forSub(SUB_B).length, 1);
	});
	it('rotate swaps the key and stamps rotated_at, keeping the id', () => {
		const store = openAgentStore({ path });
		const rec = record();
		store.add(rec);
		const next = Buffer.alloc(32, 250).toString('base64url');
		store.rotate(rec.agent_id, { pubkey: next, fp: 'AAAA-BBBB-CCCC-DDDD', at: '2026-10-19T00:00:00.000Z' });
		const reloaded = openAgentStore({ path }).get(rec.agent_id);
		assert.deepEqual([reloaded.pubkey, reloaded.rotated_at, reloaded.agent_id], [next, '2026-10-19T00:00:00.000Z', rec.agent_id]);
	});
	it('remove persists the deletion and reports whether the write landed', () => {
		const rec = record();
		const store = openAgentStore({ path });
		store.add(rec);
		assert.deepEqual(store.remove(rec.agent_id), { removed: true, persisted: true });
		assert.equal(openAgentStore({ path }).get(rec.agent_id), undefined);
		assert.deepEqual(store.remove(rec.agent_id), { removed: false, persisted: true });
	});
	it('a remove whose write fails still removes it from memory and says persisted:false', () => {
		const rec = record();
		openAgentStore({ path }).add(rec);
		const store = openAgentStore({ path, fsImpl: { ...realFs, renameSync: () => { throw new Error('read-only fs'); } } });
		assert.deepEqual(store.remove(rec.agent_id), { removed: true, persisted: false });
		assert.equal(store.get(rec.agent_id), undefined);
		assert.ok(openAgentStore({ path }).get(rec.agent_id), 'the stale file still has it: the caller must keep a revoked set');
	});
});

describe('last_seen_at', () => {
	it('is written at most once per 600 s per agent', () => {
		let writes = 0;
		const counting = { ...realFs, renameSync: (...args) => { writes += 1; return realFs.renameSync(...args); } };
		let clock = 1_000_000;
		const rec = record();
		const store = openAgentStore({ path, fsImpl: counting, now: () => clock });
		store.add(rec);
		const base = writes;
		store.touchSeen(rec.agent_id); clock += 599_000; store.touchSeen(rec.agent_id);
		assert.equal(writes - base, 1);
		clock += 2_000; store.touchSeen(rec.agent_id);
		assert.equal(writes - base, 2);
		assert.equal(store.get(rec.agent_id).last_seen_at, new Date(clock).toISOString());
	});
	it('a failed touch is swallowed: presence must never break a connect', () => {
		const rec = record();
		openAgentStore({ path }).add(rec);
		const store = openAgentStore({ path, fsImpl: { ...realFs, renameSync: () => { throw new Error('x'); } } });
		assert.doesNotThrow(() => store.touchSeen(rec.agent_id));
	});
});
