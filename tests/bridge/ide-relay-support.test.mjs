// The two small primitives the relay modules share: a sliding-window limiter that can be peeked
// (takeToken cannot, and a failed-claim limit must refuse BEFORE the lookup), and the audit emitter
// that writes only the fields contract 10 lists for an op.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSlidingLimiter } from '../../scripts/ide-relay-limits.mjs';
import { createAudit, AUDIT_FIELDS } from '../../scripts/ide-relay-audit.mjs';

describe('sliding limiter', () => {
	it('allows `limit` takes per window and frees them as the window slides', () => {
		let clock = 0;
		const limiter = createSlidingLimiter({ limit: 3, windowMs: 1000, now: () => clock });
		assert.deepEqual([1, 2, 3, 4].map(() => limiter.take('k')), [true, true, true, false]);
		clock = 999; assert.equal(limiter.take('k'), false);
		clock = 1001; assert.equal(limiter.take('k'), true);
	});
	it('keys are independent and peek never consumes', () => {
		const limiter = createSlidingLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
		assert.equal(limiter.peek('a'), true);
		assert.equal(limiter.peek('a'), true);
		limiter.record('a');
		assert.equal(limiter.peek('a'), false);
		assert.equal(limiter.peek('b'), true);
	});
	it('forgets idle keys so the map cannot grow with every caller ever seen', () => {
		let clock = 0;
		const limiter = createSlidingLimiter({ limit: 1, windowMs: 10, now: () => clock });
		for (let i = 0; i < 1000; i++) limiter.record(`k${i}`);
		clock = 100;
		limiter.record('late');
		assert.equal(limiter.size, 1);
	});
});

describe('audit', () => {
	const collect = () => { const lines = []; return { lines, audit: createAudit({ write: (text) => lines.push(text), now: () => 0 }) }; };
	it('writes one JSON line with ts and op, and drops fields the op does not list', () => {
		const { lines, audit } = collect();
		audit('revoke', { subj: 'S', agent: 'A', by: 'owner', dropped: 1, ms_to_drop: 4, persisted: true, data: 'SECRET-BYTES', token: 'tok' });
		assert.equal(lines.length, 1);
		assert.ok(lines[0].endsWith('\n') && lines[0].indexOf('\n') === lines[0].length - 1);
		const parsed = JSON.parse(lines[0]);
		assert.deepEqual(Object.keys(parsed).sort(), ['agent', 'by', 'dropped', 'ms_to_drop', 'op', 'persisted', 'subj', 'ts']);
		assert.ok(!lines[0].includes('SECRET-BYTES') && !lines[0].includes('tok'));
	});
	it('fills a listed field the caller omitted with null so the shape is stable', () => {
		const { lines, audit } = collect();
		audit('pair_claim', { subj: 'S', status: 'miss' });
		assert.equal(JSON.parse(lines[0]).pair, null);
	});
	it('refuses an op that is not in the contract', () => {
		assert.throws(() => collect().audit('data', { bytes: 'x' }), /unknown audit op/);
		assert.deepEqual(Object.keys(AUDIT_FIELDS).sort(), ['auth_fail', 'bytes', 'connect', 'disconnect', 'pair_accept', 'pair_claim', 'pair_confirm', 'pair_start', 'revoke', 'rotate', 'session_close', 'session_open']);
	});
});
