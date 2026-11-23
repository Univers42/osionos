// osionos#240: POST /api/pages/from-markdown creates one page from a markdown document, with
// the editor's own import (ruling M240-2 … M240-17). Every test signs in as its own user, so
// the per-user rate limit (20 in a burst) never decides a test it is not about.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';
import { markdownImportBlocks } from '../../scripts/bridge-markdown-engine.mjs';

const config = harnessConfig();
const PATH = '/api/pages/from-markdown';
const OUTSIDE = 'a5a5a5a5-1111-4111-8111-a5a5a5a5a5a5';
const REPLY_KEYS = new Set(['id', 'title', 'blockCount', 'version']);

/** A fresh editor of the team: the world, their session and their id. */
function editor({ memberRole = 'editor' } = {}) {
	const userId = randomUUID();
	const world = teamWorld();
	world.osionos_workspace_members.push({ workspace_id: IDS.team, user_id: userId, role: memberRole, permissions: memberRole === 'viewer' ? ['read'] : ['create', 'read', 'update'] });
	world.osionos_pages.push({ ...teamPage(OUTSIDE, IDS.userA, 'shared', 'A home page', 'home text'), workspace_id: IDS.homeA });
	return { userId, world, headers: sessionHeaders(config, userId, randomUUID()) };
}

const pageWrites = (mock) => mock.calls.filter((call) => call.method !== 'GET' && call.table === 'osionos_pages');
const withoutIds = (blocks) => JSON.parse(JSON.stringify(blocks, (key, value) => (key === 'id' ? undefined : value)));

async function create(body, { world, headers } = editor()) {
	const mock = createPostgrestMock(world);
	const answer = await withBridge(config, mock.fetchImpl, (base) => send(base, PATH, headers, post(body)));
	return { answer, mock, created: pageWrites(mock).length ? mock.rows('osionos_pages').at(-1) : null };
}

describe('POST /api/pages/from-markdown: the page it creates', () => {
	it('stores the editor import of the markdown and answers 201 with id, title and blockCount (M240-17)', async () => {
		const markdown = '# Plan\n\n- one\n- two\n\nSome **bold** text.';
		const { answer, created } = await create({ workspaceId: IDS.team, title: 'Plan', markdown });
		assert.equal(answer.status, 201, answer.text);
		assert.deepEqual(withoutIds(created.content), withoutIds(markdownImportBlocks(markdown)));
		assert.equal(answer.body.id, created.id);
		assert.equal(answer.body.title, 'Plan');
		assert.equal(answer.body.blockCount, created.content.length);
		assert.ok(Object.keys(answer.body).every((key) => REPLY_KEYS.has(key)), answer.text);
		assert.ok(!answer.text.includes('bold'), 'the reply never carries the stored content');
	});

	it('makes the page private and the caller\'s, ignoring every other key the client sends (M240-8)', async () => {
		const who = editor();
		const { answer, created } = await create({
			workspaceId: IDS.team, title: 'Mine', markdown: 'text',
			id: randomUUID(), visibility: 'shared', collaborators: [IDS.userA], owner: IDS.userA, owner_id: IDS.userA, ownerId: IDS.userA,
			icon: 'x', cover: 'https://example.test/c.png', properties: [{ a: 1 }], content: [{ type: 'paragraph', content: 'injected' }], isTemplate: true, surprise: 'echo-me',
		}, who);
		assert.equal(answer.status, 201, answer.text);
		assert.equal(created.owner_id, who.userId);
		assert.equal(created.visibility, 'private');
		assert.deepEqual(created.collaborators, []);
		assert.deepEqual(created.properties, []);
		assert.equal(created.icon, null);
		assert.equal(created.cover, null);
		assert.ok(!('is_template' in created));
		assert.notEqual(answer.body.id, undefined);
		assert.ok(!JSON.stringify(created.content).includes('injected'));
		assert.ok(!answer.text.includes('echo-me') && !answer.text.includes(IDS.userA));
	});

	it('stores an empty document as a page with no blocks', async () => {
		const { answer, created } = await create({ workspaceId: IDS.team, markdown: '' });
		assert.equal(answer.status, 201, answer.text);
		assert.deepEqual(created.content, []);
		assert.equal(answer.body.blockCount, 0);
		assert.equal(answer.body.title, 'Untitled');
	});

	it('creates two pages for two concurrent requests', async () => {
		const who = editor();
		const mock = createPostgrestMock(who.world);
		const answers = await withBridge(config, mock.fetchImpl, (base) => Promise.all([
			send(base, PATH, who.headers, post({ workspaceId: IDS.team, title: 'One', markdown: 'a' })),
			send(base, PATH, who.headers, post({ workspaceId: IDS.team, title: 'Two', markdown: 'b' })),
		]));
		assert.deepEqual(answers.map((answer) => answer.status), [201, 201]);
		assert.notEqual(answers[0].body.id, answers[1].body.id);
		assert.equal(pageWrites(mock).length, 2);
	});
});

describe('POST /api/pages/from-markdown: who may create (M240-6, M240-7)', () => {
	it('refuses a caller without a session (401) and a read-only member (403), writing nothing', async () => {
		const anonymous = await create({ workspaceId: IDS.team, markdown: 'a' }, { ...editor(), headers: { 'content-type': 'application/json' } });
		assert.equal(anonymous.answer.status, 401);
		const viewer = await create({ workspaceId: IDS.team, markdown: 'a' }, editor({ memberRole: 'viewer' }));
		assert.equal(viewer.answer.status, 403, viewer.answer.text);
		assert.deepEqual(pageWrites(viewer.mock), []);
	});

	it('answers a missing parent and a hidden one with the same status, body bytes and call sequence', async () => {
		const who = editor();
		const answers = [];
		for (const parentPageId of [IDS.missing, IDS.privateA, OUTSIDE]) {
			const { answer, mock } = await create({ workspaceId: IDS.team, title: 'Nested', markdown: '# x', parentPageId }, { world: structuredClone(who.world), headers: who.headers });
			assert.equal(answer.status, 404, answer.text);
			assert.deepEqual(pageWrites(mock), []);
			answers.push({ status: answer.status, text: answer.text, calls: mock.calls.map((call) => `${call.method} ${call.table}?${String(call.params).replaceAll(parentPageId, '<parent>')}`) });
		}
		assert.deepEqual(answers[1], answers[0]);
		assert.deepEqual(answers[2], answers[0]);
	});

	it('nests under a parent the caller can write', async () => {
		const who = editor();
		who.world.osionos_pages.push(teamPage(IDS.missing, who.userId, 'private', 'Own parent', 'p'));
		const { answer, created } = await create({ workspaceId: IDS.team, markdown: 'child', parentPageId: IDS.missing }, who);
		assert.equal(answer.status, 201, answer.text);
		assert.equal(created.parent_page_id, IDS.missing);
	});
});

describe('POST /api/pages/from-markdown: limits (M240-2, M240-3)', () => {
	it('accepts exactly 64 KiB of markdown in UTF-8 bytes and answers 413 one byte over, before any database call', async () => {
		const atCap = await create({ workspaceId: IDS.team, markdown: 'é'.repeat(32_768) });
		assert.equal(atCap.answer.status, 201, atCap.answer.text);
		for (const markdown of ['é'.repeat(32_768) + 'a', 'é'.repeat(40_000)]) {
			const over = await create({ workspaceId: IDS.team, markdown });
			assert.equal(over.answer.status, 413, over.answer.text);
			assert.deepEqual(over.mock.calls, []);
		}
	});

	it('caps the request body at 512 KiB', async () => {
		const { answer, mock } = await create({ workspaceId: IDS.team, markdown: 'a', padding: 'p'.repeat(600 * 1024) });
		assert.equal(answer.status, 413, answer.text);
		assert.deepEqual(mock.calls, []);
	});

	it('takes a title of 200 UTF-16 units, surrogate pairs included, and answers 400 above', async () => {
		for (const title of ['t'.repeat(200), '😀'.repeat(100)]) {
			const { answer, created } = await create({ workspaceId: IDS.team, title, markdown: 'a' });
			assert.equal(answer.status, 201, answer.text);
			assert.equal(created.title, title);
		}
		for (const title of ['t'.repeat(201), `${'😀'.repeat(100)}a`, 42]) {
			const { answer, mock } = await create({ workspaceId: IDS.team, title, markdown: 'a' });
			assert.equal(answer.status, 400, answer.text);
			assert.deepEqual(mock.calls, []);
		}
	});

	it('answers 400 to a body that is not a JSON object or has no markdown string', async () => {
		const who = editor();
		const mock = createPostgrestMock(who.world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			for (const body of ['{not json', '[]', 'null', JSON.stringify({ workspaceId: IDS.team }), JSON.stringify({ workspaceId: IDS.team, markdown: 7 })]) {
				const answer = await send(base, PATH, who.headers, { method: 'POST', body });
				assert.equal(answer.status, 400, `${body}: ${answer.text}`);
			}
		});
		assert.deepEqual(mock.calls, []);
	});

	it('answers 413 page_too_large when the converted page is over the edge cap, and writes nothing', async () => {
		const { answer, mock } = await create({ workspaceId: IDS.team, markdown: 'a\n\n'.repeat(16_000) });
		assert.equal(answer.status, 413, answer.text);
		assert.equal(answer.body.code, 'page_too_large');
		assert.deepEqual(pageWrites(mock), []);
	});
});

describe('POST /api/pages/from-markdown: rate limit (M240-5)', () => {
	it('answers 429 with Retry-After once a user spends the burst', async () => {
		const who = editor();
		const mock = createPostgrestMock(who.world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const statuses = [];
			let limited = null;
			for (let index = 0; index < 21; index += 1) {
				const response = await fetch(`${base}${PATH}`, { method: 'POST', headers: who.headers, body: JSON.stringify({ markdown: 'a' }) });
				statuses.push(response.status);
				if (response.status === 429) limited = response.headers.get('retry-after');
				await response.text();
			}
			// No workspaceId: each request is refused (422) without a database call, yet spends a token.
			assert.deepEqual(statuses, [...Array(20).fill(422), 429]);
			assert.match(limited ?? '', /^[1-9]\d*$/);
		});
	});
});
