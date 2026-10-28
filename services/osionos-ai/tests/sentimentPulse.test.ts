import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, before, after, describe, it } from 'node:test';
import { AUTHOR, PAGE_PRIVATE, PAGE_PUBLIC, WS_PRIVATE, installHooks, pool, ready, sentimentReady, sha } from './moderationHarness.ts';
import { serveAi, tokenFor } from './serveAi.ts';

/**
 * The Pulse and the thread mood (M6): C138, C140, C141, C142. Scores are seeded
 * straight into ai_sentiment, the handler has its own tests.
 */

installHooks();

const base = await serveAi();

const VIEWER = randomUUID();
const STRANGER = randomUUID();
const PAST = "date_trunc('week', now()) - interval '3 days'"; // inside the last completed week

async function get(token: string, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
	const response = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
	return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}
const pulse = (user: string, weeks = 12) => get(tokenFor(user), `/api/ai/workspaces/${WS_PRIVATE}/sentiment/pulse?weeks=${weeks}`);
const mood = (user: string, page: string) => get(tokenFor(user), `/api/ai/pages/${page}/sentiment/mood`);

/** One scored comment per author on a page; `when` is a SQL timestamp expression. */
async function seed(page: string, authors: number, labels: string[], when: string, scoredContent?: string): Promise<void> {
	for (let i = 0; i < authors; i += 1) {
		const id = randomUUID();
		const content = `comment ${i} ${id}`;
		await pool.query(
			`insert into public.osionos_page_comments (id, page_id, author_id, content, created_at) values ($1, $2, $3, $4, ${when})`,
			[id, page, randomUUID(), content],
		);
		await pool.query(
			`insert into public.ai_sentiment (subject_kind, subject_id, workspace_id, label, confidence, model, content_sha256)
			 values ('page_comment', $1, $2, $3, 0.9, 'test', $4)`,
			[id, WS_PRIVATE, labels[i % labels.length], sha(scoredContent ?? content)],
		);
	}
}

const optIn = (enabled = true) =>
	pool.query(
		`insert into public.ai_sentiment_settings (workspace_id, enabled) values ($1, $2)
		 on conflict (workspace_id) do update set enabled = excluded.enabled`,
		[WS_PRIVATE, enabled],
	);

describe('the sentiment pulse and thread mood', { timeout: 60_000, skip: ready && sentimentReady ? false : 'the sentiment migration was not applied' }, () => {
	before(async () => {
		await pool.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values
			 ($1, $2, 'owner', array['read']), ($1, $3, 'viewer', array['read'])`,
			[WS_PRIVATE, AUTHOR, VIEWER],
		);
	});

	afterEach(async () => {
		await pool.query('delete from public.ai_sentiment_settings where workspace_id = $1', [WS_PRIVATE]);
		await pool.query('delete from public.ai_sentiment where workspace_id = $1', [WS_PRIVATE]);
		await pool.query('delete from public.osionos_page_comments where page_id = any($1::uuid[])', [[PAGE_PUBLIC, PAGE_PRIVATE]]);
	});

	after(async () => {
		await pool.query('delete from public.osionos_workspace_members where workspace_id = $1', [WS_PRIVATE]);
	});

	it('C140 k: a past week with 4 distinct authors is absent; with 5 it is present with the right counts', async () => {
		await optIn();
		await seed(PAGE_PUBLIC, 4, ['negative', 'positive'], PAST);
		const four = await pulse(VIEWER);
		assert.equal(four.status, 200);
		assert.deepEqual(four.body, { enabled: true, minAuthors: 5, weeks: [] });

		await seed(PAGE_PUBLIC, 1, ['neutral'], PAST); // 5th author
		const five = await pulse(VIEWER);
		const weekStart = (await pool.query(`select to_char(date_trunc('week', now()) - interval '1 week', 'YYYY-MM-DD') as w`)).rows[0].w;
		assert.deepEqual(five.body.weeks, [{ weekStart, negative: 2, neutral: 1, positive: 2 }]);
		assert.ok(!JSON.stringify(five.body).includes('author'), 'C140: no author data in the answer');
	});

	it('C140 current week: this week is never counted, however many authors', async () => {
		await optIn();
		await seed(PAGE_PUBLIC, 6, ['positive'], 'now()');
		assert.deepEqual((await pulse(VIEWER)).body.weeks, []);
	});

	it('C140 weeks: only 1..52 integers are accepted', async () => {
		await optIn();
		for (const weeks of ['0', '53', 'x', '1.5', '-1', '']) {
			assert.equal((await get(tokenFor(VIEWER), `/api/ai/workspaces/${WS_PRIVATE}/sentiment/pulse?weeks=${weeks}`)).status, 400, weeks);
		}
		assert.equal((await pulse(VIEWER, 52)).status, 200);
	});

	it('C141 the comments of a private page are not counted for a viewer who cannot read it, but are for its owner', async () => {
		await optIn();
		await seed(PAGE_PRIVATE, 5, ['negative'], PAST);
		assert.deepEqual((await pulse(VIEWER)).body.weeks, []);
		const owner = (await pulse(AUTHOR)).body.weeks as Array<Record<string, unknown>>;
		assert.equal(owner.length, 1);
		assert.equal(owner[0].negative, 5);
	});

	it('does not count comments on a rule-hidden page', async () => {
		await optIn();
		const hiddenPage = randomUUID();
		const ruleId = randomUUID();
		try {
			await pool.query('insert into public.osionos_pages (id, workspace_id, owner_id, visibility) values ($1, $2, $3, \'public\')', [hiddenPage, WS_PRIVATE, AUTHOR]);
			await pool.query(
				`insert into public.osionos_share_rules (id, workspace_id, resource_type, resource_id, target, permission, explicit)
				 values ($1, $2, 'page', $3, $4::jsonb, 'no_access', true)`,
				[ruleId, WS_PRIVATE, hiddenPage, JSON.stringify({ type: 'user', userId: VIEWER })],
			);
			await seed(hiddenPage, 5, ['negative'], PAST);
			await seed(PAGE_PUBLIC, 5, ['positive'], PAST);
			const weekStart = (await pool.query(`select to_char(date_trunc('week', now()) - interval '1 week', 'YYYY-MM-DD') as w`)).rows[0].w;
			assert.deepEqual((await pulse(VIEWER)).body.weeks, [{ weekStart, negative: 0, neutral: 0, positive: 5 }]);
		} finally {
			await pool.query('delete from public.osionos_share_rules where id = $1', [ruleId]);
			await pool.query('delete from public.osionos_page_comments where page_id = $1', [hiddenPage]);
			await pool.query('delete from public.osionos_pages where id = $1', [hiddenPage]);
		}
	});

	it('C138 disabled: enabled false and no weeks; a non-member gets 404 on both routes', async () => {
		await seed(PAGE_PUBLIC, 5, ['negative'], PAST);
		assert.deepEqual((await pulse(VIEWER)).body, { enabled: false, weeks: [] });
		await optIn();
		assert.equal((await pulse(STRANGER)).status, 404);
		assert.equal((await mood(STRANGER, PAGE_PRIVATE)).status, 404);
	});

	it('C142 a stale score (content changed after scoring) is not counted', async () => {
		await optIn();
		await seed(PAGE_PUBLIC, 5, ['negative'], PAST, 'the text that was scored');
		assert.deepEqual((await pulse(VIEWER)).body.weeks, []);
		assert.deepEqual((await mood(VIEWER, PAGE_PUBLIC)).body, { mood: null });
	});

	it('C140 mood: 4 authors give null, 5 give the majority label and its share; an unreadable or missing page is the same 404', async () => {
		await optIn();
		await seed(PAGE_PUBLIC, 4, ['positive'], 'now()');
		assert.deepEqual((await mood(VIEWER, PAGE_PUBLIC)).body, { mood: null });

		await seed(PAGE_PUBLIC, 1, ['negative'], 'now()');
		assert.deepEqual((await mood(VIEWER, PAGE_PUBLIC)).body, { mood: 'positive', share: 0.8 });

		const hidden = await mood(VIEWER, PAGE_PRIVATE);
		const missing = await mood(VIEWER, randomUUID());
		assert.equal(hidden.status, 404);
		assert.deepEqual(hidden, missing);

		await optIn(false);
		assert.deepEqual((await mood(VIEWER, PAGE_PUBLIC)).body, { mood: null });
	});
});
