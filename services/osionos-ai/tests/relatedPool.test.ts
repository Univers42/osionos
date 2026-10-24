import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import type { AuthUser } from '../src/auth.ts';
import { createPool, isPoolTimeout } from '../src/db.ts';
import { checkRunRateLimit } from '../src/rateLimit.ts';
import { relatedPages } from '../src/retrieval/related.ts';
import { startHarness, awaitWindowRoom } from './harness.ts';
import { vectorFor } from './mockEmbed.ts';
import { USER_A, WORKSPACE_A } from './retrievalSeed.ts';

/**
 * The pool of the related read.
 *
 * The read holds ONE connection for the whole answer. A request that holds a
 * connection while asking the pool for a second one DEADLOCKS the route: the
 * pool hands out ten connections, ten requests take them, and every one of
 * them waits for the eleventh for ever.
 *
 * The test drives the read on a pool of TWO connections with SIX requests at
 * once: it must answer, and it must answer in seconds.
 */

const harness = await startHarness();
const db: Pool = harness.app.db;

/** The caller of the reads: the owner of the workspace A. */
const user: AuthUser = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now() };

/** The bound of one read: a request that waits for ever is a failure, not a test. */
const DEADLINE_MS = 20_000;

/** Whether the graph migration is applied: the related read needs the page vectors. */
const applied = await db.query("select to_regclass('public.ai_page_vectors') as vectors");
const hasVectors = Boolean(applied.rows[0]?.vectors);

/** The promise, or a refusal when it takes too long. */
function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`${label} did not answer in ${ms} ms`)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

/** A page and its vector: the source of the related reads. */
async function seedSource(): Promise<string> {
	const id = randomUUID();
	await db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, collaborators, content)
		 values ($1, $2, $3, 'Source', 'shared', '[]'::jsonb, '[]'::jsonb)`,
		[id, WORKSPACE_A, USER_A],
	);
	await db.query(
		`insert into public.ai_page_vectors (workspace_id, page_id, embedding, embedding_model)
		 values ($1, $2, $3::halfvec, 'test')`,
		[WORKSPACE_A, id, JSON.stringify(vectorFor('the topic'))],
	);
	// The neighbours: without them the kNN answers nothing and the links are
	// never read, and the read would not take a second connection at all.
	for (let index = 0; index < 3; index += 1) {
		const neighbour = randomUUID();
		await db.query(
			`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, collaborators, content)
			 values ($1, $2, $3, $4, 'shared', '[]'::jsonb, '[]'::jsonb)`,
			[neighbour, WORKSPACE_A, USER_A, `Neighbour ${index}`],
		);
		await db.query(
			`insert into public.ai_page_vectors (workspace_id, page_id, embedding, embedding_model)
			 values ($1, $2, $3::halfvec, 'test')`,
			[WORKSPACE_A, neighbour, JSON.stringify(vectorFor(`neighbour ${index}`))],
		);
	}
	return id;
}

/** The empty tables, before and after the file. */
async function clear(): Promise<void> {
	await db.query('delete from public.ai_page_vectors');
	await db.query('delete from public.osionos_pages');
	await db.query('delete from public.osionos_workspace_members');
}

before(async () => {
	if (!hasVectors) return;
	await clear();
});

after(async () => {
	if (hasVectors) await clear();
	await harness.app.close();
	await harness.mock.close();
});

describe('the pool of the related read', { skip: hasVectors ? false : 'the graph migration was not applied' }, () => {
	it('six concurrent reads on a pool of two connections all answer', async () => {
		const source = await seedSource();
		const pool = createPool(process.env.OSIONOS_AI_DATABASE_URL ?? '', 2);
		try {
			const started = Date.now();
			const answers = await Promise.all(
				Array.from({ length: 6 }, () =>
					withDeadline(relatedPages(pool, user, source, 8), DEADLINE_MS, 'a related read'),
				),
			);
			const ms = Date.now() - started;
			console.log(`[pool] six related reads on a pool of two: ${ms} ms`);
			assert.ok(ms < DEADLINE_MS, `the six reads took ${ms} ms`);
			for (const answer of answers) assert.ok(Array.isArray(answer), 'every read answers a list');
		} finally {
			// The pool may still hold a client of a read that never answered:
			// the end must not hang the file.
			await Promise.race([
				pool.end().catch(() => undefined),
				new Promise((resolve) => setTimeout(resolve, 5_000)),
			]);
		}
	});

	it('a pool that had no connection to give answers 503', async () => {
		const source = await seedSource();
		const original = db.connect.bind(db);
		// The pool refuses to hand out a connection: the read asks for one and
		// gets the pg timeout. `Pool.query` asks for a connection WITH a
		// callback, and the read asks for one WITHOUT: only the second is the
		// refusal of the pool.
		(db as unknown as { connect: unknown }).connect = (...args: unknown[]) => {
			if (args.length === 0) throw new Error('timeout exceeded when trying to connect');
			return (original as (...rest: unknown[]) => unknown)(...args);
		};
		try {
			const response = await fetch(`${harness.base}/api/ai/pages/${source}/related?k=8`, {
				headers: { authorization: `Bearer ${harness.tokenFor(USER_A, WORKSPACE_A)}` },
			});
			const text = await response.text();
			assert.equal(response.status, 503, text);
		} finally {
			(db as unknown as { connect: unknown }).connect = original;
		}
	});

	it('the related read has its own window, and spending it leaves the runs alone', async () => {
		await awaitWindowRoom();
		const { config } = await import('../src/config.ts');
		// A caller of its own: the window is per user, and the other tests of the
		// file must not find it spent. The page is not theirs, so every call that
		// passes the window answers 404.
		const caller = randomUUID();
		const token = harness.tokenFor(caller, WORKSPACE_A);
		const statuses: number[] = [];
		for (let call = 0; call <= config.relatedPerMinute; call += 1) {
			const response = await fetch(`${harness.base}/api/ai/pages/${randomUUID()}/related`, {
				headers: { authorization: `Bearer ${token}` },
			});
			await response.text();
			statuses.push(response.status);
		}
		assert.equal(statuses.at(-1), 429, 'past the window the read is refused');
		assert.ok(statuses.slice(0, -1).every((status) => status === 404), statuses.join(','));
		const run = await checkRunRateLimit(harness.app.redis, caller, 1);
		assert.equal(run.allowed, true, 'the runs of the caller still have their window');
	});

	it('the refusal of the pool is the one the installed pg says', async () => {
		const pool = createPool(process.env.OSIONOS_AI_DATABASE_URL ?? '', 1);
		const held = await pool.connect();
		try {
			await assert.rejects(pool.connect(), (error: unknown) => isPoolTimeout(error));
		} finally {
			held.release();
			await pool.end();
		}
		assert.equal(isPoolTimeout(new Error('something else')), false);
	});
});
