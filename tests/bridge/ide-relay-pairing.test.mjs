// Pairing (contract 4) at module level with an injected clock: codes, expiry, limits, the
// confirm/accept state machine. The same flow over HTTP is covered in ide-relay-http.test.mjs.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPairing } from '../../scripts/ide-relay-pairing.mjs';
import { openAgentStore } from '../../scripts/ide-relay-store.mjs';
import {
	generateAgentKeyPair, signMessage, pairMessage, acceptMessage, b64url, fingerprint, newAgentId, subjectTag,
} from '../../scripts/ide-agent-frames.mjs';

const ORIGIN = 'https://relay.example';
const SUB_A = '11111111-1111-4111-8111-111111111111';
const SUB_B = '22222222-2222-4222-8222-222222222222';

let dir; let clock; let audits; let store; let pairing;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'ide-relay-pairing-'));
	clock = 1_760_000_000_000;
	audits = [];
	store = openAgentStore({ path: join(dir, 'agents.json'), now: () => clock });
	pairing = createPairing({ store, origin: ORIGIN, now: () => clock, audit: (op, fields) => audits.push({ op, ...fields }) });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function agent(name = 'laptop') {
	const keys = generateAgentKeyPair();
	const pubkey = b64url(keys.publicKeyRaw);
	const startBody = (ts = clock) => ({
		pubkey, name, os_user: 'dylan', platform: 'linux-x64', version: '1.0.0', ts,
		sig: signMessage(keys.privateKey, pairMessage({ origin: ORIGIN, pubkey, name, ts })),
	});
	const acceptSig = (pairId, sub) => signMessage(keys.privateKey, acceptMessage({ origin: ORIGIN, pairId, subj: subjectTag(sub) }));
	return { keys, pubkey, startBody, acceptSig, fp: fingerprint(keys.publicKeyRaw) };
}

function begin(who = agent(), ctx = {}) {
	const started = pairing.start(who.startBody(), ctx);
	assert.equal(started.status, 201, JSON.stringify(started.body));
	return { who, ...started.body, code: started.body.user_code };
}

function pairedThrough(sub = SUB_A, who = agent()) {
	const pair = begin(who);
	assert.equal(pairing.claim({ sub, code: pair.code }).status, 200);
	assert.equal(pairing.confirm({ sub, code: pair.code, fp: who.fp }).status, 202);
	return pair;
}

describe('start', () => {
	it('issues a secret pair_id and an XXXX-XXXX code from the 20-letter alphabet', () => {
		const { pair_id: pairId, user_code: code, expires_in: expires, interval } = begin();
		assert.match(code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
		assert.equal(Buffer.from(pairId, 'base64url').length, 32);
		assert.deepEqual([expires, interval], [300, 5]);
	});
	it('never stores the code or the pair_id in clear and audits only the short tag', () => {
		const { code, pair_id: pairId } = begin();
		const dump = JSON.stringify([...Object.values(pairing.debugSnapshot())]);
		assert.ok(!dump.includes(code) && !dump.includes(code.replace('-', '')) && !dump.includes(pairId));
		assert.match(audits[0].pair, /^[0-9a-f]{8}$/);
		assert.equal(audits[0].status, 'ok');
	});
	it('rejects a signature over another origin, another name, or a skewed ts', () => {
		const who = agent();
		const body = who.startBody();
		assert.equal(pairing.start({ ...body, name: 'other' }, {}).status, 400);
		assert.equal(audits.at(-1).status, 'bad-sig');
		assert.equal(pairing.start(who.startBody(clock - 121_000), {}).status, 400);
		assert.equal(audits.at(-1).status, 'skew');
		assert.equal(pairing.start(who.startBody(clock + 119_000), {}).status, 201);
	});
	it('rejects malformed fields before any state is created', () => {
		const body = agent().startBody();
		for (const bad of [{ pubkey: 'AAAA' }, { name: '../etc' }, { os_user: '' }, { platform: 'plan9-mips' }, { version: 5 }]) {
			assert.equal(pairing.start({ ...body, ...bad }, {}).status, 400, JSON.stringify(bad));
		}
		assert.equal(pairing.pendingCount, 0);
	});
	it('5 starts per client key per 600 s, then limited; the window slides', () => {
		const ctx = { ip: '203.0.113.0/24' };
		for (let i = 0; i < 5; i++) assert.equal(pairing.start(agent().startBody(), ctx).status, 201);
		assert.equal(pairing.start(agent().startBody(), ctx).status, 429);
		assert.equal(audits.at(-1).status, 'limited');
		assert.equal(pairing.start(agent().startBody(), { ip: '198.51.100.0/24' }).status, 201);
		clock += 601_000;
		assert.equal(pairing.start(agent().startBody(), ctx).status, 201);
	});
	it('with no trusted client ip every caller shares one key of 20 per 600 s, and 20 pending is the cap', () => {
		for (let i = 0; i < 20; i++) assert.equal(pairing.start(agent().startBody(), {}).status, 201, `start ${i}`);
		const over = pairing.start(agent().startBody(), {});
		assert.equal(over.status, 429);
	});
	it('a full pending table answers 503 once the rate allows more than the table holds', () => {
		const wide = createPairing({ store, origin: ORIGIN, now: () => clock, globalStarts: 100, audit: (op, fields) => audits.push({ op, ...fields }) });
		for (let i = 0; i < 20; i++) assert.equal(wide.start(agent().startBody(), { ip: `10.0.${i}.0/24` }).status, 201);
		assert.equal(wide.start(agent().startBody(), { ip: '10.9.9.0/24' }).status, 503);
		assert.equal(audits.at(-1).status, 'full');
	});
});

describe('claim and confirm', () => {
	it('claim returns the review data and binds nothing', () => {
		const { code, who } = begin(agent('work-box'), { ip: '203.0.113.0/24' });
		const claimed = pairing.claim({ sub: SUB_A, code, ipPrefix: '198.51.100.0/24' });
		assert.equal(claimed.status, 200);
		assert.deepEqual(
			{ ...claimed.body, age_s: 'n' },
			{ fp: who.fp, name: 'work-box', os_user: 'dylan', platform: 'linux-x64', version: '1.0.0', age_s: 'n', agent_ip_prefix: '203.0.113.0/24', your_ip_prefix: '198.51.100.0/24', subj: subjectTag(SUB_A) },
		);
		assert.equal(pairing.claim({ sub: SUB_B, code }).status, 200, 'a lookup is not a lock');
	});
	it('accepts the code in any case, with or without the dash', () => {
		const { code } = begin();
		assert.equal(pairing.claim({ sub: SUB_A, code: code.toLowerCase().replace('-', ' ') }).status, 200);
	});
	it('a miss and an expired code give the identical 404 body', () => {
		const { code } = begin();
		const miss = pairing.claim({ sub: SUB_A, code: 'BBBB-BBBB' });
		clock += 301_000;
		const expired = pairing.claim({ sub: SUB_A, code });
		assert.deepEqual([miss.status, expired.status], [404, 404]);
		assert.deepEqual(miss.body, expired.body);
	});
	it('5 failed lookups per sub per 600 s stop all lookups, including a correct code', () => {
		const { code } = begin();
		for (let i = 0; i < 5; i++) assert.equal(pairing.claim({ sub: SUB_A, code: 'BBBB-BBBB' }).status, 404);
		assert.equal(pairing.claim({ sub: SUB_A, code }).status, 429);
		assert.equal(audits.at(-1).status, 'limited');
		assert.equal(pairing.claim({ sub: SUB_B, code }).status, 200, 'another sub is unaffected');
	});
	it('10 lookups per sub per 600 s', () => {
		const { code } = begin();
		for (let i = 0; i < 10; i++) assert.equal(pairing.claim({ sub: SUB_A, code }).status, 200);
		assert.equal(pairing.claim({ sub: SUB_A, code }).status, 429);
	});
	it('confirm with the wrong fp is 409 and binds nothing (T-N17)', () => {
		const { code, who } = begin();
		assert.equal(pairing.confirm({ sub: SUB_A, code, fp: 'AAAA-AAAA-AAAA-AAAA' }).status, 409);
		assert.equal(audits.at(-1).status, 'fp-mismatch');
		assert.equal(pairing.confirm({ sub: SUB_B, code, fp: who.fp }).status, 202, 'nothing was bound by the failed confirm');
	});
	it('the first confirm binds the code to its sub; another sub gets 409 taken', () => {
		const { code, who } = begin();
		assert.equal(pairing.confirm({ sub: SUB_A, code, fp: who.fp }).status, 202);
		assert.equal(pairing.confirm({ sub: SUB_B, code, fp: who.fp }).status, 409);
		assert.equal(audits.at(-1).status, 'taken');
		assert.equal(pairing.confirm({ sub: SUB_A, code, fp: who.fp }).status, 202, 'the same sub may repeat itself');
	});
	it('a sub at 3 agents, counting pending confirms, gets 409 cap at confirm (T-N11)', () => {
		pairedThrough(); pairedThrough(); pairedThrough();
		const fourth = begin();
		assert.equal(pairing.confirm({ sub: SUB_A, code: fourth.code, fp: fourth.who.fp }).status, 409);
		assert.equal(audits.at(-1).status, 'cap');
	});
});

describe('poll, accept, decline', () => {
	it('poll is pending until confirmed, then claimed with the account, and not faster than every 5 s', () => {
		const { pair_id: pairId, code, who } = begin();
		assert.deepEqual(pairing.poll({ pairId }), { status: 200, body: { status: 'pending' } });
		assert.equal(pairing.poll({ pairId }).status, 429);
		pairing.confirm({ sub: SUB_A, code, fp: who.fp, username: 'dylan' });
		clock += 5_000;
		assert.deepEqual(pairing.poll({ pairId }), { status: 200, body: { status: 'claimed', account: { un: 'dylan', subj: subjectTag(SUB_A) } } });
	});
	it('accept with the agent signature writes the record once and returns the agent_id', () => {
		const { pair_id: pairId, who } = pairedThrough();
		const accepted = pairing.accept({ pairId, sig: who.acceptSig(pairId, SUB_A) });
		assert.equal(accepted.status, 201);
		const record = store.get(accepted.body.agent_id);
		assert.deepEqual([record.sub, record.pubkey, record.fp, record.name], [SUB_A, who.pubkey, who.fp, 'laptop']);
		assert.equal(audits.at(-1).op, 'pair_accept');
		assert.equal(audits.at(-1).status, 'ok');
		assert.equal(pairing.accept({ pairId, sig: who.acceptSig(pairId, SUB_A) }).status, 410, 'replayed accept');
	});
	it('accept before confirm is 409; a signature for another account is refused and consumes nothing', () => {
		const { pair_id: pairId, who, code } = begin();
		assert.equal(pairing.accept({ pairId, sig: who.acceptSig(pairId, SUB_A) }).status, 409);
		pairing.confirm({ sub: SUB_A, code, fp: who.fp });
		assert.equal(pairing.accept({ pairId, sig: who.acceptSig(pairId, SUB_B) }).status, 401);
		assert.equal(store.list().length, 0);
		assert.equal(pairing.accept({ pairId, sig: who.acceptSig(pairId, SUB_A) }).status, 201);
	});
	it('poll and accept after 300 s are 410, and so is an unknown pair_id', () => {
		const { pair_id: pairId, who } = pairedThrough();
		clock += 301_000;
		assert.equal(pairing.poll({ pairId }).status, 410);
		assert.equal(pairing.accept({ pairId, sig: who.acceptSig(pairId, SUB_A) }).status, 410);
		assert.equal(audits.at(-1).status, 'expired');
		assert.equal(pairing.poll({ pairId: b64url(Buffer.alloc(32, 9)) }).status, 410);
		assert.equal(store.list().length, 0);
	});
	it('the 300 s budget runs from start, confirming does not extend it', () => {
		const { pair_id: pairId, code, who } = begin();
		clock += 299_000;
		pairing.confirm({ sub: SUB_A, code, fp: who.fp });
		clock += 2_000;
		assert.equal(pairing.accept({ pairId, sig: who.acceptSig(pairId, SUB_A) }).status, 410);
	});
	it('a 4th agent at accept time is 409 cap and the pending entry is dropped (T-N11)', () => {
		const late = pairedThrough();
		for (let i = 0; i < 3; i++) {
			const other = agent(`box-${i}`);
			store.add({ agent_id: newAgentId(), sub: SUB_A, pubkey: other.pubkey, fp: other.fp, name: `box-${i}`, os_user: 'dylan', platform: 'linux-x64', created_at: null, rotated_at: null, last_seen_at: null });
		}
		assert.equal(pairing.accept({ pairId: late.pair_id, sig: late.who.acceptSig(late.pair_id, SUB_A) }).status, 409);
		assert.equal(audits.at(-1).status, 'cap');
		assert.equal(pairing.poll({ pairId: late.pair_id }).status, 410);
	});
	it('decline creates no record, audits declined, and the pair_id is spent', () => {
		const { pair_id: pairId } = pairedThrough();
		assert.equal(pairing.decline({ pairId }).status, 204);
		assert.equal(audits.at(-1).status, 'declined');
		assert.equal(store.list().length, 0);
		assert.equal(pairing.poll({ pairId }).status, 410);
	});
	it('a failed registry write leaves the pairing retryable and answers 500', () => {
		const { pair_id: pairId, who } = pairedThrough();
		const original = store.add;
		store.add = () => { throw new Error('disk full'); };
		assert.equal(pairing.accept({ pairId, sig: who.acceptSig(pairId, SUB_A) }).status, 500);
		store.add = original;
		assert.equal(pairing.accept({ pairId, sig: who.acceptSig(pairId, SUB_A) }).status, 201);
	});
});
