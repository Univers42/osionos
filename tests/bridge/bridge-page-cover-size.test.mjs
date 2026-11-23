// CS15 (cover-writer ruling Q2 items 3–6): a page's cover size is stored as sent or not
// at all. coverHeight is an integer 120–640 and coverWidth is 'full' or 'content'; any
// other value is never clamped into range — a PATCH lists it in `ignored` and still
// writes the rest of the edit. null clears the column, an absent key leaves it alone, and
// a read never answers a size key for a NULL column, so pages without a size stay
// byte-identical (PS26, Q3 F2).
// Caveat: the PostgREST mock stores whatever the bridge sends; the column CHECKs
// (120..640, full|content) were not run here.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';
import { pageUpdateRowFromPayload } from '../../scripts/bridge-api.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const asViewerB = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);
const NEW_ID = 'e2e2e2e2-1111-4111-8111-e2e2e2e2e2e2';
const SIZED = { cover_height: 300, cover_width: 'full' };

const INVALID = [
	['coverHeight', 100],
	['coverHeight', 641],
	['coverHeight', 700],
	['coverHeight', 237.5],
	['coverHeight', '240'],
	['coverWidth', 'wide'],
	['coverWidth', 'FULL'],
	['coverWidth', 240],
];

function sizedWorld(columns = SIZED) {
	const world = teamWorld({ memberRole: 'editor' });
	Object.assign(world.osionos_pages.find((row) => row.id === IDS.privateA), columns);
	return world;
}

const hasSizeKey = (entry) => Object.hasOwn(entry, 'coverHeight') || Object.hasOwn(entry, 'coverWidth');

describe('PATCH /api/pages/:id cover size (CS15)', () => {
	for (const [key, value] of INVALID) {
		it(`ignores ${key}=${JSON.stringify(value)}, keeps the stored size and writes the rest`, async () => {
			const mock = createPostgrestMock(sizedWorld());
			await withBridge(config, mock.fetchImpl, async (base) => {
				const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ title: 'Resized', [key]: value }));
				assert.equal(result.status, 200, result.text);
				assert.deepEqual(result.body.ignored, [key]);
				const stored = mock.page(IDS.privateA);
				assert.equal(stored.title, 'Resized');
				assert.deepEqual([stored.cover_height, stored.cover_width], [300, 'full']);
			});
		});
	}

	it('answers 200 with only `ignored` when the invalid size was the whole edit', async () => {
		const mock = createPostgrestMock(sizedWorld());
		const before = structuredClone(mock.page(IDS.privateA));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ coverHeight: 641, coverWidth: 'wide' }));
			assert.equal(result.status, 200, result.text);
			assert.deepEqual(result.body.ignored, ['coverHeight', 'coverWidth']);
			assert.deepEqual(mock.page(IDS.privateA), before);
		});
	});

	it('writes a valid size as sent: 240 / content, and the bounds 120 and 640', async () => {
		const mock = createPostgrestMock(sizedWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ coverHeight: 240, coverWidth: 'content' }));
			assert.equal(result.status, 200, result.text);
			assert.equal(result.body.ignored, undefined);
			assert.deepEqual([mock.page(IDS.privateA).cover_height, mock.page(IDS.privateA).cover_width], [240, 'content']);
			const read = await send(base, `/api/pages/${IDS.privateA}`, asA);
			assert.deepEqual([read.body.coverHeight, read.body.coverWidth], [240, 'content']);
			for (const height of [120, 640]) {
				assert.equal((await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ coverHeight: height }))).status, 200);
				assert.equal(mock.page(IDS.privateA).cover_height, height);
			}
		});
	});

	it('clears both columns on null, and a later read carries no size key', async () => {
		const mock = createPostgrestMock(sizedWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ coverHeight: null, coverWidth: null }));
			assert.equal(result.status, 200, result.text);
			assert.equal(result.body.ignored, undefined);
			assert.deepEqual([mock.page(IDS.privateA).cover_height, mock.page(IDS.privateA).cover_width], [null, null]);
			assert.equal(hasSizeKey((await send(base, `/api/pages/${IDS.privateA}`, asA)).body), false);
		});
	});

	it('writes the valid half of a mixed size and lists only the invalid half', async () => {
		const mock = createPostgrestMock(sizedWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ coverHeight: 240, coverWidth: 'wide' }));
			assert.equal(result.status, 200, result.text);
			assert.deepEqual(result.body.ignored, ['coverWidth']);
			assert.deepEqual([mock.page(IDS.privateA).cover_height, mock.page(IDS.privateA).cover_width], [240, 'full']);
		});
	});

	it('refuses a viewer the same 403 for a valid and an invalid size, and writes nothing', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'viewer' }), { realWorkspaceRpc: true });
		const before = structuredClone(mock.page(IDS.sharedA));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const valid = await send(base, `/api/pages/${IDS.sharedA}`, asViewerB, patch({ coverHeight: 240, coverWidth: 'content' }));
			const invalid = await send(base, `/api/pages/${IDS.sharedA}`, asViewerB, patch({ coverHeight: 700, coverWidth: 'wide' }));
			assert.equal(valid.status, 403, valid.text);
			assert.deepEqual([invalid.status, invalid.body], [valid.status, valid.body]);
			assert.deepEqual(mock.page(IDS.sharedA), before);
		});
	});

	it('leaves the size untouched when the PATCH does not name it', async () => {
		const mock = createPostgrestMock(sizedWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.privateA}`, asA, patch({ title: 'Renamed' }));
			assert.equal(result.status, 200, result.text);
			assert.deepEqual([mock.page(IDS.privateA).cover_height, mock.page(IDS.privateA).cover_width], [300, 'full']);
			const sent = mock.calls.filter((call) => call.method === 'PATCH' && call.table === 'osionos_pages');
			assert.equal(sent.some((call) => JSON.stringify(call.body).includes('cover_')), false);
		});
	});
});

describe('POST /api/pages cover size (CS15, insert path)', () => {
	const create = (extra) => post({ workspaceId: IDS.team, id: NEW_ID, title: 'Built', ...extra });

	for (const [key, value] of [...INVALID, ['coverHeight', null], ['coverWidth', null]]) {
		it(`creates the page without ${key}=${JSON.stringify(value)} and answers no size key`, async () => {
			const mock = createPostgrestMock(sizedWorld());
			await withBridge(config, mock.fetchImpl, async (base) => {
				const result = await send(base, '/api/pages', asA, create({ [key]: value }));
				assert.equal(result.status, 201, result.text);
				assert.equal(mock.page(NEW_ID).title, 'Built');
				assert.equal(Object.hasOwn(mock.page(NEW_ID), 'cover_height'), false);
				assert.equal(Object.hasOwn(mock.page(NEW_ID), 'cover_width'), false);
				assert.equal(hasSizeKey(result.body), false);
			});
		});
	}

	it('creates the page with a valid 240 / content size', async () => {
		const mock = createPostgrestMock(sizedWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, '/api/pages', asA, create({ coverHeight: 240, coverWidth: 'content' }));
			assert.equal(result.status, 201, result.text);
			assert.deepEqual([mock.page(NEW_ID).cover_height, mock.page(NEW_ID).cover_width], [240, 'content']);
			assert.deepEqual([result.body.coverHeight, result.body.coverWidth], [240, 'content']);
		});
	});
});

describe('reads answer a cover size only when the stored one is valid (item 5)', () => {
	const NULL_SIZE = { cover_height: null, cover_width: null };

	it('the list hydrate and the single GET carry no size key for a NULL row', async () => {
		const mock = createPostgrestMock(sizedWorld(NULL_SIZE));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const listed = await send(base, `/api/pages/all?workspaceId=${IDS.team}`, asA);
			assert.equal(listed.status, 200, listed.text);
			assert.ok(listed.body.some((entry) => entry._id === IDS.privateA));
			assert.equal(listed.body.some(hasSizeKey), false);
			assert.equal(listed.text.includes('coverHeight') || listed.text.includes('coverWidth'), false);
			const read = await send(base, `/api/pages/${IDS.privateA}`, asA);
			assert.equal(read.status, 200, read.text);
			assert.equal(hasSizeKey(read.body), false);
		});
	});

	it('the list hydrate carries a stored size (PAGE_LIST_SELECT names both columns)', async () => {
		const mock = createPostgrestMock(sizedWorld({ cover_height: 240, cover_width: 'content' }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const listed = await send(base, `/api/pages/all?workspaceId=${IDS.team}`, asA);
			assert.equal(listed.status, 200, listed.text);
			const entry = listed.body.find((row) => row._id === IDS.privateA);
			assert.deepEqual([entry.coverHeight, entry.coverWidth], [240, 'content']);
		});
	});

	it('a stored value outside the contract reads as no key, never a null', async () => {
		const mock = createPostgrestMock(sizedWorld({ cover_height: 50, cover_width: 'wide' }));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const read = await send(base, `/api/pages/${IDS.privateA}`, asA);
			assert.equal(read.status, 200, read.text);
			assert.equal(hasSizeKey(read.body), false);
		});
	});
});

describe('pageUpdateRowFromPayload keeps the size rule without a filtering caller', () => {
	for (const [key, value, column] of [['coverHeight', 700, 'cover_height'], ['coverWidth', 'wide', 'cover_width']]) {
		it(`writes no ${column} for ${key}=${JSON.stringify(value)}`, () => {
			const row = pageUpdateRowFromPayload({ title: 'Kept', [key]: value });
			assert.equal(row.title, 'Kept');
			assert.equal(row[column], undefined);
			assert.equal(JSON.stringify(row).includes(column), false);
		});
	}

	it('passes a valid size and a null clear through unchanged', () => {
		assert.deepEqual(pageUpdateRowFromPayload({ coverHeight: 240, coverWidth: 'content' }).cover_height, 240);
		assert.equal(pageUpdateRowFromPayload({ coverWidth: 'content' }).cover_width, 'content');
		const cleared = pageUpdateRowFromPayload({ coverHeight: null, coverWidth: null });
		assert.deepEqual([cleared.cover_height, cleared.cover_width], [null, null]);
	});
});
