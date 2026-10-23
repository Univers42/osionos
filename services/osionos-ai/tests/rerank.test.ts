import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { retrieve, shouldAbstain } from '../src/retrieval/search.ts';
import type { RetrievedChunk } from '../src/retrieval/search.ts';
import type { AuthUser } from '../src/auth.ts';
import { startMockEmbedder } from './mockEmbed.ts';
import { startHarness } from './harness.ts';
import { USER_A, WORKSPACE_A, Seeds, turnedVector, vectorOf } from './retrievalSeed.ts';

/**
 * The reranker of the retrieval: the order follows the cross-encoder, a
 * reranker that fails never fails a question, and with the reranker off the
 * answer is the one of the fusion.
 *
 * The three pages are the ones of the fusion test (retrieval.test.ts), so
 * the fused order is known: both, lexical, vector.
 */

const embedder = await startMockEmbedder();
process.env.OSIONOS_AI_EMBED_URL = embedder.baseUrl;
process.env.OSIONOS_AI_EMBED_MODEL = 'intfloat/multilingual-e5-small';
delete process.env.OSIONOS_AI_RERANK_URL;
delete process.env.OSIONOS_AI_RERANK_TIMEOUT_MS;

const harness = await startHarness();
const db = harness.app.db;
const seeds = new Seeds(db);
const QUERY = 'zorblax quux';
const userA: AuthUser = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now() };

/** The score a passage gets from the mock: the vector page is the best answer. */
function scoreOf(text: string): number {
	if (text.includes('says nothing of the question')) return 0.9;
	if (text.includes('filler')) return 0.5;
	return 0.1;
}

interface MockReranker {
	baseUrl: string;
	calls: number;
	status: number;
	delayMs: number;
	server: Server;
}

/** A /rerank of text-embeddings-inference: `[{index, score}]`, best score first. */
async function startMockReranker(): Promise<MockReranker> {
	const mock = { baseUrl: '', calls: 0, status: 200, delayMs: 0 } as MockReranker;
	mock.server = createServer((request, response) => {
		const parts: Buffer[] = [];
		request.on('data', (part: Buffer) => parts.push(part));
		request.on('end', () => {
			mock.calls += 1;
			const body = JSON.parse(Buffer.concat(parts).toString('utf8')) as { texts: string[] };
			const answer = (): void => {
				response.writeHead(mock.status, { 'content-type': 'application/json' });
				if (mock.status !== 200) return void response.end('{"error":"down"}');
				const scored = body.texts.map((text, index) => ({ index, score: scoreOf(text) }));
				response.end(JSON.stringify(scored.sort((left, right) => right.score - left.score)));
			};
			if (mock.delayMs > 0) setTimeout(answer, mock.delayMs);
			else answer();
		});
	});
	await new Promise<void>((resolve) => mock.server.listen(0, '127.0.0.1', () => resolve()));
	const address = mock.server.address();
	mock.baseUrl = `http://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;
	return mock;
}

const reranker = await startMockReranker();
let pages: { both: string; lexical: string; vector: string };
const warnings: string[] = [];
const realWarn = console.warn;

before(async () => {
	await seeds.clear();
});

beforeEach(async () => {
	await seeds.clear();
	const question = vectorOf(`query: ${QUERY}`);
	const seed = (title: string, content: string, embedding: number[]): Promise<string> =>
		seeds.page({ workspaceId: WORKSPACE_A, ownerId: USER_A, title, visibility: 'shared', content, embedding });
	pages = {
		both: await seed('Both', QUERY, turnedVector(question)),
		lexical: await seed('Lexical', `zorblax ${'filler '.repeat(40)}quux`, vectorOf('nothing like the question')),
		vector: await seed('Vector', 'a paragraph that says nothing of the question', question),
	};
	reranker.calls = 0;
	reranker.status = 200;
	reranker.delayMs = 0;
	warnings.length = 0;
	console.warn = (line: unknown): void => {
		warnings.push(String(line));
	};
});

afterEach(() => {
	console.warn = realWarn;
	delete process.env.OSIONOS_AI_RERANK_URL;
	delete process.env.OSIONOS_AI_RERANK_TIMEOUT_MS;
});

after(async () => {
	await seeds.clear();
	await new Promise<void>((resolve) => reranker.server.close(() => resolve()));
	await embedder.close();
	await harness.app.close();
	await harness.mock.close();
});

describe('the reranker of the retrieval', () => {
	it('the order follows the scores of the cross-encoder', async () => {
		process.env.OSIONOS_AI_RERANK_URL = reranker.baseUrl;
		const found = await retrieve(db, userA, { query: QUERY });
		assert.deepEqual(found.map((chunk) => chunk.pageId), [pages.vector, pages.lexical, pages.both]);
		assert.deepEqual(found.map((chunk) => chunk.rerankScore), [0.9, 0.5, 0.1]);
		assert.equal(reranker.calls, 1);
	});

	it('a reranker that times out leaves the fused order, and the fallback is logged', async () => {
		process.env.OSIONOS_AI_RERANK_URL = reranker.baseUrl;
		process.env.OSIONOS_AI_RERANK_TIMEOUT_MS = '50';
		reranker.delayMs = 400;
		const found = await retrieve(db, userA, { query: QUERY });
		assert.deepEqual(found.map((chunk) => chunk.pageId), [pages.both, pages.lexical, pages.vector]);
		assert.ok(found.every((chunk) => chunk.rerankScore === undefined));
		assert.deepEqual(warnings.map((line) => JSON.parse(line)), [{ event: 'rerank_fallback', kind: 'timeout' }]);
	});

	it('a reranker that answers 500 leaves the fused order, and the fallback is logged', async () => {
		process.env.OSIONOS_AI_RERANK_URL = reranker.baseUrl;
		reranker.status = 500;
		const found = await retrieve(db, userA, { query: QUERY });
		assert.deepEqual(found.map((chunk) => chunk.pageId), [pages.both, pages.lexical, pages.vector]);
		assert.deepEqual(warnings.map((line) => JSON.parse(line)), [{ event: 'rerank_fallback', kind: 'http_500' }]);
	});

	it('with the reranker off the answer is the fusion, untouched', async () => {
		const found = await retrieve(db, userA, { query: QUERY });
		assert.equal(reranker.calls, 0);
		assert.deepEqual(found.map((chunk) => chunk.pageId), [pages.both, pages.lexical, pages.vector]);
		for (const chunk of found) {
			assert.deepEqual(Object.keys(chunk).sort(), ['blockId', 'headingPath', 'pageId', 'score', 'snippet', 'title']);
		}
	});
});

describe('shouldAbstain', () => {
	const chunk = (rerankScore?: number): RetrievedChunk => ({
		pageId: 'p',
		blockId: null,
		title: 't',
		headingPath: '',
		snippet: 's',
		score: 0.03,
		...(rerankScore === undefined ? {} : { rerankScore }),
	});

	it('abstains only when the reranker ran and even the best chunk is under the threshold', () => {
		assert.equal(shouldAbstain([chunk(0.2), chunk(0.1)], 0.5), true);
		assert.equal(shouldAbstain([chunk(0.2), chunk(0.7)], 0.5), false);
		assert.equal(shouldAbstain([chunk(0.5)], 0.5), false, 'the threshold itself answers');
		assert.equal(shouldAbstain([chunk(0.1)], null), false, 'no threshold, never');
		assert.equal(shouldAbstain([chunk(), chunk()], 0.5), false, 'no rerank score, no trust');
		assert.equal(shouldAbstain([], 0.5), false, 'no chunk, nothing to judge');
	});
});
