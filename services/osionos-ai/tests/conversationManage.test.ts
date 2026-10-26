import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { startHarness, USER_A, USER_B, WORKSPACE_A } from './harness.ts';
import type { JsonBody } from './harness.ts';

/** Rename, delete and search of the conversations of a user. */
const { app, bridge, mock, call, tokenFor, createConversation } = await startHarness();

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const tokenA = tokenFor(USER_A, WORKSPACE_A);
const tokenB = tokenFor(USER_B, WORKSPACE_A);

/** The titles of the list of a user. */
async function titlesOf(token: string, search = ''): Promise<string[]> {
	const { status, body } = await call(`/api/ai/conversations?workspaceId=${WORKSPACE_A}${search}`, { token });
	assert.equal(status, 200);
	return (body?.conversations as JsonBody[]).map((row) => String(row.title));
}

const rename = (id: string, title: unknown, token = tokenA) =>
	call(`/api/ai/conversations/${id}`, { method: 'PATCH', token, body: { title } });
const remove = (id: string, token = tokenA) => call(`/api/ai/conversations/${id}`, { method: 'DELETE', token });

describe('rename', () => {
	it('lets the owner rename, trimmed', async () => {
		const id = await createConversation('old');
		const { status, body } = await rename(id, '  new name  ');
		assert.equal(status, 200);
		assert.equal(body?.title, 'new name');
		assert.ok((await titlesOf(tokenA)).includes('new name'));
	});

	it('answers 404 to another user and to a missing id, the same way', async () => {
		const id = await createConversation('mine');
		const foreign = await rename(id, 'stolen', tokenB);
		const missing = await rename('99999999-9999-4999-8999-999999999999', 'x');
		assert.equal(foreign.status, 404);
		assert.equal(missing.status, 404);
		assert.deepEqual(foreign.body, missing.body);
		assert.ok((await titlesOf(tokenA)).includes('mine'));
	});

	it('refuses a 201-character title and an empty one', async () => {
		const id = await createConversation('keep');
		assert.equal((await rename(id, 'x'.repeat(201))).status, 400);
		assert.equal((await rename(id, '   ')).status, 400);
	});

	it('answers 404 for an archived conversation', async () => {
		const id = await createConversation('gone soon');
		assert.equal((await remove(id)).status, 200);
		assert.equal((await rename(id, 'back')).status, 404);
	});
});

describe('delete', () => {
	it('drops the conversation from the list, and a second delete is 404', async () => {
		const id = await createConversation('to delete');
		assert.ok((await titlesOf(tokenA)).includes('to delete'));
		const first = await remove(id);
		assert.equal(first.status, 200);
		assert.deepEqual(first.body, { ok: true });
		assert.ok(!(await titlesOf(tokenA)).includes('to delete'));
		assert.equal((await remove(id)).status, 404);
	});

	it('answers 404 to another user and leaves the conversation alive', async () => {
		const id = await createConversation('not yours');
		assert.equal((await remove(id, tokenB)).status, 404);
		assert.ok((await titlesOf(tokenA)).includes('not yours'));
	});
});

describe('search', () => {
	it('filters titles, and % matches a literal % only', async () => {
		await createConversation('Quarterly report');
		await createConversation('100% done');
		await createConversation('plain');
		assert.deepEqual(await titlesOf(tokenA, '&q=QUARTER'), ['Quarterly report']);
		assert.deepEqual(await titlesOf(tokenA, '&q=%25'), ['100% done']);
		assert.deepEqual(await titlesOf(tokenA, '&q=_'), []);
	});

	it('without q, lists every live conversation', async () => {
		const all = await titlesOf(tokenA);
		assert.ok(all.includes('plain') && all.includes('Quarterly report'));
		assert.equal((await titlesOf(tokenA, '&q=')).length, all.length);
	});

	it('refuses a q over 100 characters', async () => {
		const { status } = await call(`/api/ai/conversations?workspaceId=${WORKSPACE_A}&q=${'a'.repeat(101)}`, { token: tokenA });
		assert.equal(status, 400);
	});
});
