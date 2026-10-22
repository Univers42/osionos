import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { startHarness } from './harness.ts';
import { vectorFor } from './mockEmbed.ts';
import { USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } from './retrievalSeed.ts';

/**
 * The related pages: the neighbours of a page, computed for ONE viewer.
 *
 * The neighbours are not stored: they are computed at read time, over the
 * pages the caller may read, in the source page's workspace. The truth table
 * of C99 has its two last columns here — related and suggestions — and the
 * kNN of C105 keeps its distance to the other workspaces.
 */

const harness = await startHarness();
const db: Pool = harness.app.db;
const SECRET = process.env.OSIONOS_APP_SESSION_SECRET ?? '';

/** A token that carries the member workspaces, the way the bridge mints one. */
function tokenFor(userId: string, workspaceId: string, members: string[] = []): string {
	return signAppSessionToken({
		payload: { subject: userId, provider: 'test' },
		workspace: { _id: workspaceId },
		config: { appSessionSecret: SECRET, sessionTtlSeconds: 3600 },
		memberWorkspaces: members.map((_id) => ({ _id, role: 'member' })),
	}).token;
}

/** The vector of a topic: the same text always gives the same vector. */
function vectorOf(topic: string): number[] {
	return vectorFor(topic);
}

/** A vector very close to another one: the nearest neighbour of a corpus. */
function near(base: number[], shift: number): number[] {
	return base.map((value, index) => value + shift * Math.sin(index + 1));
}

interface Seed {
	workspaceId?: string;
	ownerId?: string | null;
	title?: string;
	visibility?: string;
	collaborators?: unknown[];
	vector?: number[];
	/** The pages this one links to. */
	links?: string[];
}

/** A page, its vector and its links, written directly. */
async function seedPage(seed: Seed): Promise<string> {
	const id = randomUUID();
	await db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, collaborators, content)
		 values ($1, $2, $3, $4, $5, $6::jsonb, '[]'::jsonb)`,
		[
			id,
			seed.workspaceId ?? WORKSPACE_A,
			seed.ownerId === undefined ? USER_A : seed.ownerId,
			seed.title ?? 'A page',
			seed.visibility ?? 'shared',
			JSON.stringify(seed.collaborators ?? []),
		],
	);
	if (seed.vector) {
		await db.query(
			`insert into public.ai_page_vectors (workspace_id, page_id, embedding, embedding_model)
			 values ($1, $2, $3::halfvec, 'test')`,
			[seed.workspaceId ?? WORKSPACE_A, id, JSON.stringify(seed.vector)],
		);
	}
	for (const target of seed.links ?? []) {
		await db.query(
			`insert into public.osionos_page_links (source_page_id, target_page_id, workspace_id) values ($1, $2, $3)`,
			[id, target, seed.workspaceId ?? WORKSPACE_A],
		);
	}
	return id;
}

/** The answer of the related read, as the route gives it. */
async function related(pageId: string, token: string, k = 8): Promise<{ status: number; text: string }> {
	const response = await fetch(`${harness.base}/api/ai/pages/${pageId}/related?k=${k}`, {
		headers: { authorization: `Bearer ${token}` },
	});
	return { status: response.status, text: await response.text() };
}

/** The page ids of an answer. */
function idsOf(text: string): string[] {
	const body = JSON.parse(text) as { related?: { pageId: string }[] };
	return (body.related ?? []).map((page) => page.pageId);
}

/** The empty tables, before and after every test. */
async function clear(): Promise<void> {
	await db.query('delete from public.ai_page_vectors');
	await db.query('delete from public.osionos_page_links');
	await db.query('delete from public.osionos_pages');
	await db.query('delete from public.osionos_workspace_members');
}

/** A reads B too (a live members row): only the SOURCE's workspace can hide a neighbour (C105). */
async function memberOfBoth(): Promise<void> {
	await db.query(
		`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
		 values ($1, $2, 'member', array['read'])`,
		[WORKSPACE_B, USER_A],
	);
}

/**
 * Whether the graph migration is applied: the related read needs the page
 * vectors, and a run with the AI migration alone skips the suite.
 */
const applied = await db.query("select to_regclass('public.ai_page_vectors') as vectors");
const hasVectors = Boolean(applied.rows[0]?.vectors);

before(async () => {
	if (!hasVectors) return;
	await clear();
});
beforeEach(async () => {
	if (!hasVectors) return;
	await clear();
});

after(async () => {
	await harness.app.close();
	await harness.mock.close();
});

describe('the related pages', { skip: hasVectors ? false : 'the graph migration was not applied' }, () => {
	it('a private page of another member is never a neighbour, and the answer is still full', async () => {
		const topic = vectorOf('the topic');
		const source = await seedPage({ vector: topic, title: 'Source' });
		// The nearest neighbour of the source: a private page of B.
		const hidden = await seedPage({ vector: near(topic, 0.001), ownerId: USER_B, visibility: 'private' });
		// Nine readable pages, further away.
		for (let index = 0; index < 9; index += 1) {
			await seedPage({ vector: vectorOf(`other ${index}`), title: `Other ${index}` });
		}
		const answer = await related(source, tokenFor(USER_A, WORKSPACE_A));
		assert.equal(answer.status, 200, answer.text);
		const ids = idsOf(answer.text);
		assert.equal(ids.length, 8, 'k readable neighbours, not k minus one');
		assert.ok(!ids.includes(hidden), 'the private page is not a neighbour');
	});

	it('a new readable page shows up with no re-index of the source', async () => {
		const topic = vectorOf('the topic');
		const source = await seedPage({ vector: topic, title: 'Source' });
		const before = idsOf((await related(source, tokenFor(USER_A, WORKSPACE_A))).text);
		const fresh = await seedPage({ vector: near(topic, 0.002), title: 'Fresh' });
		const after = idsOf((await related(source, tokenFor(USER_A, WORKSPACE_A))).text);
		assert.ok(!before.includes(fresh));
		assert.ok(after.includes(fresh), 'the new page is a neighbour at once');
	});

	it('a page of another workspace is never a neighbour, even with the same text', async () => {
		const topic = vectorOf('the topic');
		const source = await seedPage({ vector: topic });
		await memberOfBoth();
		const other = await seedPage({ vector: near(topic, 0.0001), workspaceId: WORKSPACE_B });
		const ids = idsOf((await related(source, tokenFor(USER_A, WORKSPACE_A))).text);
		assert.ok(!ids.includes(other), 'the kNN stays in the workspace of the source');
	});

	it('a page that moved to another workspace is never a neighbour', async () => {
		const topic = vectorOf('the topic');
		const source = await seedPage({ vector: topic });
		await memberOfBoth();
		// Re-indexed from a read taken before a move A → B: the vector says A, the page says B.
		const moved = await seedPage({ vector: near(topic, 0.0001), workspaceId: WORKSPACE_B });
		await db.query('update public.ai_page_vectors set workspace_id = $2 where page_id = $1', [moved, WORKSPACE_A]);
		const ids = idsOf((await related(source, tokenFor(USER_A, WORKSPACE_A))).text);
		assert.ok(!ids.includes(moved), 'the page that left the workspace is not a neighbour');
	});

	it('a page the source already links to is marked, and it is not a suggestion', async () => {
		const topic = vectorOf('the topic');
		const linked = await seedPage({ vector: near(topic, 0.001) });
		const source = await seedPage({ vector: topic, links: [linked] });
		const answer = await related(source, tokenFor(USER_A, WORKSPACE_A));
		const body = JSON.parse(answer.text) as { related: { pageId: string; linked: boolean }[] };
		const found = body.related.find((page) => page.pageId === linked);
		assert.ok(found, 'the linked page is a neighbour');
		assert.equal(found?.linked, true, 'and the answer says it is linked');
	});

	it('a page the caller may not read is a page that does not exist', async () => {
		const privatePage = await seedPage({ ownerId: USER_B, visibility: 'private', vector: vectorOf('secret') });
		const missing = '99999999-9999-4999-8999-999999999999';
		const token = tokenFor(USER_A, WORKSPACE_A);
		const hidden = await related(privatePage, token);
		const absent = await related(missing, token);
		assert.equal(hidden.status, absent.status);
		assert.equal(hidden.text, absent.text, 'the same bytes');
	});

	it('a link to a private page and a link to a random uuid answer the same', async () => {
		const topic = vectorOf('the topic');
		const privatePage = await seedPage({ ownerId: USER_B, visibility: 'private', vector: near(topic, 0.001) });
		const source = await seedPage({ vector: topic });
		const token = tokenFor(USER_A, WORKSPACE_A);
		await db.query(`insert into public.osionos_page_links (source_page_id, target_page_id, workspace_id) values ($1, $2, $3)`, [
			source,
			privatePage,
			WORKSPACE_A,
		]);
		const hidden = await related(source, token);
		// The same source, now linking to a page that does not exist.
		await db.query('delete from public.osionos_page_links');
		await db.query(`insert into public.osionos_page_links (source_page_id, target_page_id, workspace_id) values ($1, $2, $3)`, [
			source,
			'99999999-9999-4999-8999-999999999999',
			WORKSPACE_A,
		]);
		const absent = await related(source, token);
		assert.equal(hidden.status, absent.status);
		assert.equal(hidden.text, absent.text, 'the same bytes');
	});
});

describe('the truth table of the related pages (C99)', { skip: hasVectors ? false : 'the graph migration was not applied' }, () => {
	/** The rows: the page that is hidden, and the change that hides it. */
	const ROWS: [string, Seed, (id: string) => Promise<void>][] = [
		['private neighbour', { ownerId: USER_B, visibility: 'private' }, async () => {}],
		['shared turned private', { ownerId: USER_B, visibility: 'shared' }, async (id) => {
			await db.query(`update public.osionos_pages set visibility = 'private' where id = $1`, [id]);
		}],
		['collaborator removed', { ownerId: USER_B, visibility: 'private', collaborators: [{ userId: USER_A, role: 'viewer' }] }, async (id) => {
			await db.query(`update public.osionos_pages set collaborators = '[]'::jsonb where id = $1`, [id]);
		}],
		['archived neighbour', { ownerId: USER_B, visibility: 'shared' }, async (id) => {
			await db.query(`update public.osionos_pages set archived_at = now() where id = $1`, [id]);
		}],
		['deleted neighbour', { ownerId: USER_B, visibility: 'shared' }, async (id) => {
			await db.query(`delete from public.osionos_pages where id = $1`, [id]);
		}],
		['neighbour moved to another workspace', { ownerId: USER_B, visibility: 'shared' }, async (id) => {
			await db.query(`update public.osionos_pages set workspace_id = $2 where id = $1`, [id, WORKSPACE_B]);
		}],
	];

	for (const [name, setup, change] of ROWS) {
		it(`${name}: the answer says nothing about it`, async () => {
			const topic = vectorOf('the topic');
			const hidden = await seedPage({ ...setup, vector: near(topic, 0.001) });
			const source = await seedPage({ vector: topic });
			await change(hidden);
			const answer = await related(source, tokenFor(USER_A, WORKSPACE_A));
			assert.ok(!answer.text.includes(hidden), 'the hidden page is not in the answer');
			const body = JSON.parse(answer.text) as { related?: { pageId: string; linked: boolean }[] };
			const neighbours = (body.related ?? []).filter((page) => page.pageId === hidden).length;
			const suggestions = (body.related ?? []).filter((page) => page.pageId === hidden && !page.linked).length;
			console.log(`[truth] ${name} | related ${neighbours} | suggestions ${suggestions}`);
		});
	}

	it('a private source is a source that does not exist', async () => {
		const source = await seedPage({ ownerId: USER_B, visibility: 'private', vector: vectorOf('secret') });
		const answer = await related(source, tokenFor(USER_A, WORKSPACE_A));
		assert.equal(answer.status, 404);
		assert.ok(!answer.text.includes(source));
	});

	it('an archived source is a source that does not exist', async () => {
		const source = await seedPage({ vector: vectorOf('secret') });
		await db.query(`update public.osionos_pages set archived_at = now() where id = $1`, [source]);
		const answer = await related(source, tokenFor(USER_A, WORKSPACE_A));
		assert.equal(answer.status, 404);
		assert.ok(!answer.text.includes(source));
	});

	it('membership removed: the workspace is gone at once, with the same token', async () => {
		const topic = vectorOf('the topic');
		const source = await seedPage({ vector: topic });
		await db.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions)
			 values ($1, $2, 'member', array['read'])`,
			[WORKSPACE_A, USER_B],
		);
		// The token of B carries the workspace, minted before the removal.
		const token = tokenFor(USER_B, WORKSPACE_B, [WORKSPACE_A]);
		const before = await related(source, token);
		assert.equal(before.status, 200, before.text);
		await db.query('delete from public.osionos_workspace_members where workspace_id = $1 and user_id = $2', [WORKSPACE_A, USER_B]);
		const after = await related(source, token);
		assert.equal(after.status, 404, 'the workspace is gone at once');
	});
});
