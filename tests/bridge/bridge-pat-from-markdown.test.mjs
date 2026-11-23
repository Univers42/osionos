// osionos#240 M240-15: a personal access token reaches POST /api/pages/from-markdown through
// its own PAT_ROUTES entry (permission write), its `markdown` is a write of `content`, and its
// reply follows the token's read mask. Without the entry the gate's default deny answers.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PAT_ROUTES, patWritePayload } from '../../scripts/bridge-pat-middleware.mjs';
import { send } from './support/bridge-harness.mjs';
import { bearer, fineGrained, HOME, OWNER, patRow, startPatWorld } from './support/pat-world.mjs';

const PATH = '/api/pages/from-markdown';
const ALL = ['create', 'read', 'update', 'delete', 'admin'];
const seed = { osionos_workspace_members: [{ workspace_id: HOME, user_id: OWNER, role: 'owner', permissions: ALL }] };
const BODY = JSON.stringify({ workspaceId: HOME, title: 'From MCP', markdown: '# Heading\n\nbody text' });
const classic = (...scopes) => ({ scopes });
const writes = (world) => world.pages.calls.filter((call) => call.method === 'POST' && call.table === 'osionos_pages');

async function viaPat(t, spec) {
	const { secret, row } = patRow(spec);
	return { world: await startPatWorld(t, { tokens: [row], seed, pagesOptions: { realWorkspaceRpc: true } }), secret };
}

const create = (world, secret, body = BODY) => send(world.base, PATH, bearer(secret), { method: 'POST', body });

describe('POST /api/pages/from-markdown through a personal access token', () => {
	it('creates the page for a token that may read and write, answering id, title and blockCount', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read', 'pages:write'));
		const answer = await create(world, secret);
		assert.equal(answer.status, 201, answer.text);
		assert.deepEqual(Object.keys(answer.body).filter((key) => key !== 'version').sort(), ['blockCount', 'id', 'title']);
		const stored = world.pages.rows('osionos_pages').find((row) => row.id === answer.body.id);
		assert.equal(stored.owner_id, OWNER);
		assert.equal(stored.visibility, 'private');
		assert.equal(answer.body.blockCount, stored.content.length);
	});

	it('answers a write-only token without the attributes it may not read', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:write'));
		const answer = await create(world, secret);
		assert.equal(answer.status, 201, answer.text);
		assert.deepEqual(answer.body, {});
	});

	it('refuses markdown from a token that may not write content (403 pat_forbidden_attribute) and writes nothing', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['title', 'workspaceId'], ['read', 'write']));
		const answer = await create(world, secret);
		assert.equal(answer.status, 403, answer.text);
		assert.equal(answer.body.code, 'pat_forbidden_attribute');
		assert.deepEqual(writes(world), []);
	});

	it('checks markdown against the mask as content', () => {
		const mask = (...attributes) => Object.assign(attributes, { route: 'from-markdown' });
		const payload = { workspaceId: HOME, title: 'T', markdown: '# x' };
		assert.throws(() => patWritePayload(payload, mask('title', 'workspaceId')), (error) => error.status === 403 && /: content\.$/.test(error.message));
		assert.equal(patWritePayload(payload, mask('content', 'title', 'workspaceId')), payload);
	});

	it('creates for a token whose mask holds content, title and workspaceId', async (t) => {
		const { world, secret } = await viaPat(t, fineGrained(['content', 'title', 'workspaceId'], ['write']));
		const answer = await create(world, secret);
		assert.equal(answer.status, 201, answer.text);
		assert.equal(writes(world).length, 1);
	});

	it('refuses a read-only token with pat_scope_denied', async (t) => {
		const { world, secret } = await viaPat(t, classic('pages:read'));
		const answer = await create(world, secret);
		assert.equal(answer.status, 403);
		assert.equal(answer.body.error, 'pat_scope_denied');
		assert.deepEqual(writes(world), []);
	});

	it('falls back to the default deny without its PAT_ROUTES entry', async (t) => {
		const index = PAT_ROUTES.findIndex((route) => route.route === 'from-markdown');
		assert.notEqual(index, -1);
		const [entry] = PAT_ROUTES.splice(index, 1);
		t.after(() => PAT_ROUTES.splice(index, 0, entry));
		const { world, secret } = await viaPat(t, classic('pages:read', 'pages:write'));
		const answer = await create(world, secret);
		assert.equal(answer.status, 403);
		assert.equal(answer.body.error, 'pat_route_not_allowed');
		assert.deepEqual(writes(world), []);
	});
});
