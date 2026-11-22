import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';

/** The mode route (AM10, AM11 set-time, AM18) and the pure mode helpers. */
const USER_ALLOWED = '11111111-1111-4111-8111-111111111111';
const USER_PLAIN = '22222222-2222-4222-8222-222222222222';
process.env.OSIONOS_AI_MODES = 'on';
process.env.OSIONOS_AI_MODES_USERS = USER_ALLOWED;

const { startHarness, USER_A, WORKSPACE_A, WORKSPACE_B } = await import('./harness.ts');
const { narrower, writeRank } = await import('../src/modes/mode.ts');
const { app, mock, bridge, call, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const tokenA = tokenFor(USER_A, WORKSPACE_A);
const tokenPlain = tokenFor(USER_PLAIN, WORKSPACE_A);
/** A session eleven minutes old: the human is not there any more. */
const staleA = signAppSessionToken({
	payload: { subject: USER_A, provider: 'test' },
	workspace: { _id: WORKSPACE_A },
	config: { appSessionSecret: process.env.OSIONOS_APP_SESSION_SECRET ?? '', sessionTtlSeconds: 3600 },
	now: Date.now() - 11 * 60 * 1000,
}).token;

const patch = (id: string, body: unknown, token = tokenA) =>
	call(`/api/ai/conversations/${id}/mode`, { method: 'PATCH', token, body });
const get = (id: string, token = tokenA) => call(`/api/ai/conversations/${id}/mode`, { token });

async function page(workspaceId: string, ownerId: string | null, archived = false, visibility = 'shared'): Promise<string> {
	const row = await app.db.query<{ id: string }>(
		`insert into public.osionos_pages (workspace_id, owner_id, visibility, archived_at)
		 values ($1, $2, $3, ${archived ? 'now()' : 'null'}) returning id`,
		[workspaceId, ownerId, visibility],
	);
	return row.rows[0].id;
}

describe('mode route', () => {
	it('starts manual, round-trips plan, and a plan PATCH needs no fresh session', async () => {
		const id = await createConversation('m1');
		assert.deepEqual((await get(id)).body, { mode: 'manual', anchorPageId: null });
		const set = await patch(id, { mode: 'plan' }, staleA);
		assert.equal(set.status, 200);
		assert.deepEqual((await get(id)).body, { mode: 'plan', anchorPageId: null });
		const stamp = await app.db.query('select assist_mode_set_at from public.ai_conversations where id = $1', [id]);
		assert.ok(stamp.rows[0].assist_mode_set_at, 'the set-time is stamped');
	});

	it('accepts accept_edits with a writable anchor and returns it', async () => {
		const id = await createConversation('m2');
		const anchor = await page(WORKSPACE_A, USER_A);
		const set = await patch(id, { mode: 'accept_edits', anchorPageId: anchor });
		assert.equal(set.status, 200);
		assert.deepEqual((await get(id)).body, { mode: 'accept_edits', anchorPageId: anchor });
	});

	it('accepts auto from a fresh session', async () => {
		const id = await createConversation('m3');
		assert.equal((await patch(id, { mode: 'auto' })).status, 200);
		assert.equal((await get(id)).body?.mode, 'auto');
	});

	it('refuses accept_edits and auto from a stale session with reauth_required', async () => {
		const id = await createConversation('m4');
		const anchor = await page(WORKSPACE_A, USER_A);
		for (const body of [{ mode: 'accept_edits', anchorPageId: anchor }, { mode: 'auto' }]) {
			const answer = await patch(id, body, staleA);
			assert.equal(answer.status, 403);
			assert.equal(answer.body?.code, 'reauth_required');
		}
		assert.equal((await get(id)).body?.mode, 'manual');
	});

	it('refuses a non-manual mode for a user off the allowlist, but allows manual', async () => {
		const id = await createConversation('m5', tokenPlain);
		const refused = await patch(id, { mode: 'plan' }, tokenPlain);
		assert.equal(refused.status, 403);
		assert.equal(refused.body?.code, 'modes_not_enabled');
		assert.equal((await patch(id, { mode: 'manual' }, tokenPlain)).status, 200);
	});

	it('refuses accept_edits without an anchor, with an unwritable one, or an archived one: 422', async () => {
		const id = await createConversation('m6');
		const foreign = await page(WORKSPACE_B, USER_A);
		const archived = await page(WORKSPACE_A, USER_A, true);
		// A workspace owner does not read another member's private page.
		const others = await page(WORKSPACE_A, USER_PLAIN, false, 'private');
		const missing = '99999999-9999-4999-8999-999999999999';
		for (const anchorPageId of [undefined, foreign, archived, others, missing]) {
			const answer = await patch(id, { mode: 'accept_edits', anchorPageId });
			assert.equal(answer.status, 422, `${anchorPageId === foreign ? "foreign" : anchorPageId === archived ? "archived" : anchorPageId === others ? "others" : String(anchorPageId)}`);
			assert.equal(answer.body?.code, 'anchor_invalid');
		}
		assert.equal((await get(id)).body?.mode, 'manual');
	});

	it('refuses an anchor on any mode but accept_edits: 400', async () => {
		const id = await createConversation('m7');
		const anchor = await page(WORKSPACE_A, USER_A);
		for (const mode of ['manual', 'plan', 'auto']) {
			const answer = await patch(id, { mode, anchorPageId: anchor });
			assert.equal(answer.status, 400);
			assert.equal(answer.body?.code, 'anchor_not_allowed');
		}
	});

	it('refuses bypass and unknown fields: 400', async () => {
		const id = await createConversation('m8');
		assert.equal((await patch(id, { mode: 'bypass' })).status, 400);
		assert.equal((await patch(id, { mode: 'plan', extra: 1 })).status, 400);
	});

	it('answers 404 for another user conversation and a malformed id', async () => {
		const id = await createConversation('m9');
		assert.equal((await get(id, tokenPlain)).status, 404);
		assert.equal((await patch(id, { mode: 'manual' }, tokenPlain)).status, 404);
		assert.equal((await get('not-a-uuid')).status, 404);
	});

	it('answers 401 to a bearer that is not a session (a personal access token)', async () => {
		const id = await createConversation('m10');
		assert.equal((await get(id, 'osn_pat_0123456789abcdef')).status, 401);
	});
});

describe('narrower', () => {
	const manual = { mode: 'manual', anchorPageId: null } as const;
	const plan = { mode: 'plan', anchorPageId: null } as const;
	const auto = { mode: 'auto', anchorPageId: null } as const;
	const edits = (anchorPageId: string) => ({ mode: 'accept_edits', anchorPageId }) as const;

	it('ranks manual = plan < accept_edits < auto', () => {
		assert.deepEqual(['manual', 'plan', 'accept_edits', 'auto'].map((m) => writeRank(m as never)), [0, 0, 1, 2]);
	});

	it('takes the lower rank, and keeps the first on a tie', () => {
		assert.deepEqual(narrower(auto, edits('a')), edits('a'));
		assert.equal(narrower(plan, manual), plan);
		assert.equal(narrower(manual, plan), manual);
	});

	it('equal accept_edits anchors keep a; different anchors fall to manual', () => {
		const a = edits('a');
		assert.equal(narrower(a, edits('a')), a);
		assert.deepEqual(narrower(a, edits('b')), manual);
	});
});
