import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

/** The auto apply (AM4, AM10-AM12): the applied write, its 401 path, and AM1 for the token. */
const { app, bridge, autoDecide, page, kit, row, append } = await import('./autoDecideFixture.ts');

describe('autoDecide', () => {
	beforeEach(async () => {
		const keys = await app.redis.keys('ai:rl:auto*');
		if (keys.length > 0) await app.redis.del(...keys);
		bridge.reset();
	});

	it('claims, writes with the credential, records executed with decided_by auto:auto', async () => {
		const k = await kit();
		const target = await page();
		const r = await row(k, 'add_blocks', append(target));
		const outcome = await autoDecide(k.gate, r);
		assert.equal(outcome.kind, 'applied');
		if (outcome.kind !== 'applied') return;
		assert.equal(outcome.event.decidedBy, 'auto:auto');
		assert.equal(outcome.event.target, target);
		assert.equal(outcome.event.undoable, true);
		const stored = (await app.db.query('select status, decided_by from public.ai_approvals where id = $1', [r.id])).rows[0];
		assert.deepEqual(stored, { status: 'executed', decided_by: 'auto:auto' });
		assert.equal(bridge.calls.length, 1);
		assert.equal(bridge.calls[0].authorization, 'Bearer the-session-token');
	});

	it('a 401 gives the claim back: pending, no decider, one bridge call, card credential_rejected', async () => {
		const k = await kit();
		const r = await row(k, 'add_blocks', append(await page()));
		bridge.failWith = 401;
		try {
			assert.deepEqual(await autoDecide(k.gate, r), { kind: 'card', reason: 'credential_rejected' });
		} finally {
			bridge.failWith = 0;
		}
		const stored = (await app.db.query('select status, decided_by, error from public.ai_approvals where id = $1', [r.id])).rows[0];
		assert.deepEqual(stored, { status: 'pending', decided_by: null, error: null });
		assert.equal(bridge.calls.length, 1);
	});

	it('another refusal is recorded failed and told to the model as not applied', async () => {
		const k = await kit();
		const r = await row(k, 'add_blocks', append(await page()));
		bridge.failWith = 500;
		try {
			const outcome = await autoDecide(k.gate, r);
			assert.equal(outcome.kind, 'refused');
		} finally {
			bridge.failWith = 0;
		}
		const stored = (await app.db.query('select status from public.ai_approvals where id = $1', [r.id])).rows[0];
		assert.equal(stored.status, 'failed');
	});

	it('a row someone else already decided is refused, never written twice', async () => {
		const k = await kit();
		const r = await row(k, 'add_blocks', append(await page()));
		await app.db.query("update public.ai_approvals set status = 'declined' where id = $1", [r.id]);
		assert.equal((await autoDecide(k.gate, r)).kind, 'refused');
		assert.equal(bridge.calls.length, 0);
	});

	it('a card leaves the row pending and calls nothing', async () => {
		const k = await kit({ mode: 'manual', anchorPageId: null });
		const r = await row(k, 'add_blocks', append(await page()));
		assert.deepEqual(await autoDecide(k.gate, r), { kind: 'card', reason: 'mode_manual' });
		assert.equal(bridge.calls.length, 0);
	});
});

describe('AM1: an applied write leaves the token nowhere', () => {
	it('an applied write leaves no row, event or bridge-visible field holding the token', async () => {
		const k = await kit();
		const r = await row(k, 'add_blocks', append(await page()));
		const outcome = await autoDecide(k.gate, r);
		const stored = await app.db.query('select * from public.ai_approvals where id = $1', [r.id]);
		assert.ok(!JSON.stringify([outcome, stored.rows]).includes('the-session-token'));
		assert.ok((await app.redis.keys('*')).every((key) => !key.includes('the-session-token')));
	});
});
