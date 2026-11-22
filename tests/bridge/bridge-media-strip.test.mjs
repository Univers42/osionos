// osionos#233 D233-1, defence in depth: a page write never stores a signed media link, even from a
// client that did not strip it (an old bundle, a script). The link dies within 2 h; the bare path
// is what the page must keep. N1 (security review 2026-11-22): a bridge with no media key signs
// nothing, so it stores every page body exactly as sent.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripMediaSignatures } from '../../scripts/bridge-media-sign.mjs';
import { validatedPageContent } from '../../scripts/bridge-content-validation.mjs';
import { IDS, createPostgrestMock, harnessConfig, patch, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const SECRET = 'media-url-secret-for-tests-0123456789';
const BARE = `/api/media/uploads/${IDS.userA}/${'cd'.repeat(32)}.png`;
const SIGNED = `${BARE}?exp=1763830800&kid=0a1b2c3d&sig=${'9f'.repeat(32)}`;
const NEW_PAGE = 'a5a5a5a5-1111-4111-8111-a5a5a5a5a5a5';

/** Run a describe's tests with MEDIA_URL_SECRET set to `value` (unset for undefined), restored after. */
function withMediaSecret(value) {
	let saved;
	before(() => {
		saved = process.env.MEDIA_URL_SECRET;
		if (value === undefined) delete process.env.MEDIA_URL_SECRET;
		else process.env.MEDIA_URL_SECRET = value;
	});
	after(() => { if (saved === undefined) delete process.env.MEDIA_URL_SECRET; else process.env.MEDIA_URL_SECRET = saved; });
}

describe('stripMediaSignatures', () => {
	it('strips a signed upload anywhere in a block tree', () => {
		const tree = [{ type: 'image', url: `https://bridge.example${SIGNED}`, children: [{ type: 'p', content: `![x](${SIGNED})` }] }];
		assert.deepEqual(stripMediaSignatures(tree), [{ type: 'image', url: `https://bridge.example${BARE}`, children: [{ type: 'p', content: `![x](${BARE})` }] }]);
	});
	it('returns the same value when nothing is signed', () => {
		const tree = [{ type: 'p', content: 'https://cdn.example/a.png?sig=1' }];
		assert.equal(stripMediaSignatures(tree), tree);
		assert.equal(stripMediaSignatures(null), null);
	});
	it('validatedPageContent stores the bare form on a bridge with a key, the body as sent without one', () => {
		const body = [{ type: 'image', content: SIGNED }];
		assert.deepEqual(validatedPageContent(body, { MEDIA_URL_SECRET: SECRET }), [{ type: 'image', content: BARE }]);
		assert.equal(validatedPageContent(body, {}), body);
	});
});

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);
const patchSigned = (mock) => withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${IDS.privateA}`, asA,
	patch({ cover: SIGNED, content: [{ id: 'b1', type: 'code', content: `curl '${SIGNED}'` }] })));

describe('page writes through a bridge that signs', () => {
	withMediaSecret(SECRET);

	it('a PATCH with a signed cover and content stores both bare', async () => {
		const mock = createPostgrestMock(teamWorld());
		const response = await patchSigned(mock);
		assert.equal(response.status, 200, response.text);
		assert.equal(mock.page(IDS.privateA).cover, BARE);
		assert.equal(mock.page(IDS.privateA).content[0].content, `curl '${BARE}'`);
	});

	it('a POST with a signed cover stores it bare', async () => {
		const mock = createPostgrestMock(teamWorld());
		const body = { id: NEW_PAGE, workspaceId: IDS.homeA, title: 'New', cover: SIGNED, content: [] };
		const response = await withBridge(config, mock.fetchImpl, (base) => send(base, '/api/pages', asA, post(body)));
		assert.ok(response.status === 200 || response.status === 201, response.text);
		assert.equal(mock.page(NEW_PAGE).cover, BARE);
	});
});

describe('page writes through a bridge with no media key (N1)', () => {
	withMediaSecret(undefined);

	it('a PATCH stores the cover and a code block exactly as sent', async () => {
		const mock = createPostgrestMock(teamWorld());
		const response = await patchSigned(mock);
		assert.equal(response.status, 200, response.text);
		assert.equal(mock.page(IDS.privateA).cover, SIGNED);
		assert.equal(mock.page(IDS.privateA).content[0].content, `curl '${SIGNED}'`);
	});

	it('a POST stores the cover exactly as sent', async () => {
		const mock = createPostgrestMock(teamWorld());
		const body = { id: NEW_PAGE, workspaceId: IDS.homeA, title: 'New', cover: SIGNED, content: [] };
		const response = await withBridge(config, mock.fetchImpl, (base) => send(base, '/api/pages', asA, post(body)));
		assert.ok(response.status === 200 || response.status === 201, response.text);
		assert.equal(mock.page(NEW_PAGE).cover, SIGNED);
	});
});
