// C156 / C164.3 / C164.4: a page create may carry its id and replays only for its owner in
// the same workspace under the same parent; a database create may refuse an existing key.
// Without the new fields (`id`, `ifAbsent`) both routes behave as before.
// Caveat: the PostgREST mock raises 23505 from the table's unique key; real PostgREST was
// not run here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);
const NEW_ID = 'e1e1e1e1-2222-4222-8222-e1e1e1e1e1e1';
const create = (extra = {}) => post({ workspaceId: IDS.team, title: 'Built', ...extra });
const pageInserts = (mock) => mock.calls.filter((call) => call.method === 'POST' && call.table === 'osionos_pages');
const dbWrites = (mock) => mock.calls.filter((call) => call.method !== 'GET' && call.table === 'osionos_object_databases');
const world = () => teamWorld({ memberRole: 'editor' });

describe('creating a page with a client id', () => {
	it('C156 a create with a new id inserts that id', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const created = await send(base, '/api/pages', asB, create({ id: NEW_ID }));
			assert.equal(created.status, 201, created.text);
			assert.equal(created.body._id, NEW_ID);
			assert.equal(mock.page(NEW_ID).owner_id, IDS.userB);
		});
	});

	it('C156 replaying the same create returns the same page and inserts nothing', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const first = await send(base, '/api/pages', asB, create({ id: NEW_ID }));
			const second = await send(base, '/api/pages', asB, create({ id: NEW_ID }));
			assert.deepEqual([first.status, second.status], [201, 200]);
			assert.equal(second.body._id, NEW_ID);
			assert.equal(mock.rows('osionos_pages').filter((row) => row.id === NEW_ID).length, 1);
			assert.equal(pageInserts(mock).length, 2, 'the replay attempts the insert, which the key refuses');
		});
	});

	it("C164.3 someone else's page id answers 409 and reveals nothing", async () => {
		const mock = createPostgrestMock(world());
		const before = JSON.parse(JSON.stringify(mock.rows('osionos_pages')));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const taken = await send(base, '/api/pages', asB, create({ id: IDS.privateA }));
			assert.equal(taken.status, 409, taken.text);
			assert.deepEqual(taken.body, { error: 'id_conflict' });
			assert.ok(!taken.text.includes('A private plan'));
			assert.ok(!taken.text.includes('A-SECRET'));
			assert.deepEqual(mock.rows('osionos_pages'), before);
		});
	});

	it('C164.3 the caller\'s own id in another workspace or under another parent is 409', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const otherWorkspace = await send(base, '/api/pages', asB, post({ workspaceId: IDS.homeB, title: 'Built', id: IDS.pageB }));
			const otherParent = await send(base, '/api/pages', asB, create({ id: IDS.pageB, parentPageId: IDS.sharedA }));
			for (const answer of [otherWorkspace, otherParent]) {
				assert.equal(answer.status, 409, answer.text);
				assert.deepEqual(answer.body, { error: 'id_conflict' });
			}
			assert.equal(mock.page(IDS.pageB).title, 'B notes');
		});
	});

	it('C156 a bad id is refused like a bad parent id', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const badParent = await send(base, '/api/pages', asB, create({ parentPageId: 'nope' }));
			const badId = await send(base, '/api/pages', asB, create({ id: 'nope' }));
			assert.equal(badId.status, badParent.status);
			assert.deepEqual(pageInserts(mock), []);
		});
	});

	it('C156 a create without an id is unchanged', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const created = await send(base, '/api/pages', asB, create());
			assert.equal(created.status, 201, created.text);
			const [insert] = pageInserts(mock);
			assert.equal(Object.hasOwn(insert.body, 'id'), false);
			assert.deepEqual(Object.keys(insert.body).sort(), [
				'collaborators', 'content', 'cover', 'database_id', 'icon', 'owner_id', 'parent_page_id',
				'properties', 'sort_order', 'surface', 'title', 'visibility', 'workspace_id',
			]);
		});
	});
});

describe('creating an object database', () => {
	const seeded = () => ({ osionos_object_databases: [{ id: 'row-1', owner_id: IDS.userB, workspace_id: null, db_key: 'db-abc', title: 'Old', state: { x: 1 } }] });

	it('C164.4 a create-only database never overwrites an existing key', async () => {
		const mock = createPostgrestMock(seeded());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/object-databases', asB, post({ dbKey: 'db-abc', title: 'New', state: { y: 2 }, ifAbsent: true }));
			assert.equal(answer.status, 409, answer.text);
			assert.deepEqual(answer.body, { error: 'db_exists' });
			assert.deepEqual(mock.rows('osionos_object_databases')[0].state, { x: 1 });
			assert.equal(mock.rows('osionos_object_databases')[0].title, 'Old');
		});
	});

	it('C164.4 a create-only database with a new key inserts it', async () => {
		const mock = createPostgrestMock(seeded());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/object-databases', asB, post({ dbKey: 'db-new', title: 'New', state: { y: 2 }, ifAbsent: true }));
			assert.equal(answer.status, 200, answer.text);
			assert.equal(answer.body.ok, true);
			assert.equal(answer.body.dbKey, 'db-new');
			assert.equal(mock.rows('osionos_object_databases').length, 2);
			assert.equal(dbWrites(mock)[0].params.has('on_conflict'), false);
		});
	});

	it('C156 the upsert without ifAbsent is unchanged', async () => {
		const mock = createPostgrestMock(seeded());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, '/api/object-databases', asB, post({ dbKey: 'db-abc', title: 'New', state: { y: 2 } }));
			assert.equal(answer.status, 200, answer.text);
			assert.deepEqual(mock.rows('osionos_object_databases')[0].state, { y: 2 });
			assert.equal(dbWrites(mock)[0].params.get('on_conflict'), 'owner_id,db_key');
			assert.match(dbWrites(mock)[0].prefer, /merge-duplicates/);
		});
	});
});
