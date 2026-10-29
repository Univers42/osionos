/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-append.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The atomic append route. The append lands through the RPC (public.osionos_page_append)
// and never as a PostgREST write of osionos_pages, the permission path is the PATCH's
// own, and a payload the route refuses costs no BaaS call at all.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const PAGE = IDS.sharedA;
const STORED = [{ id: 'b1', type: 'paragraph', content: 'stored text' }];
const EDITED = [{ id: 'b2', type: 'paragraph', content: 'edited text' }];
const BLOCKS = [{ id: 'b2', type: 'paragraph', content: 'appended text' }];
const asOwner = sessionHeaders(config, IDS.userA, IDS.homeA);

function world() {
	const seeded = teamWorld();
	const page = seeded.osionos_pages.find((row) => row.id === PAGE);
	page.version = 4;
	page.content = STORED;
	return seeded;
}

/**
 * The append function the migration installs: it appends to the page and answers the
 * new version + the new content (returns table(version bigint, content jsonb)).
 */
function appendRpc(body, { table }) {
	const page = table('osionos_pages').find((row) => row.id === body.p_page_id);
	const blocks = Array.isArray(body.p_blocks) ? body.p_blocks : [];
	page.content = [...(Array.isArray(page.content) ? page.content : []), ...blocks];
	page.version = Number(page.version ?? 0) + 1;
	return [{ version: page.version, content: page.content }];
}

const append = (body) => ({ method: 'POST', body: JSON.stringify(body) });
const rpcCalls = (mock) => mock.calls.filter((call) => call.table === 'rpc/osionos_page_append');
const pagePatches = (mock) => mock.calls.filter((call) => call.method === 'PATCH' && call.table === 'osionos_pages');

describe('the append route', () => {
	it('appends through the RPC and writes no page row', async () => {
		const mock = createPostgrestMock(world(), { rpc: { osionos_page_append: appendRpc } });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const ok = await send(base, `/api/pages/${PAGE}/blocks`, asOwner, append({ blocks: BLOCKS, idempotencyKey: 'append-key-1' }));
			assert.equal(ok.status, 200, ok.text);
			assert.equal(ok.body.ok, true);
			assert.equal(ok.body.version, 5);
			assert.deepEqual(ok.body.content, [...STORED, ...BLOCKS]);
			assert.equal(rpcCalls(mock).length, 1);
			assert.equal(rpcCalls(mock)[0].body.p_page_id, PAGE);
			assert.deepEqual(rpcCalls(mock)[0].body.p_blocks, BLOCKS);
			assert.equal(rpcCalls(mock)[0].body.p_after_block_id, null);
			assert.equal(rpcCalls(mock)[0].body.p_idempotency_key, 'append-key-1');
			assert.deepEqual(pagePatches(mock), []);
		});
	});

	it('answers a page the caller may not edit like the PATCH does', async () => {
		const mock = createPostgrestMock(teamWorld({ memberRole: 'viewer' }), { rpc: { osionos_page_append: appendRpc } });
		const asViewer = sessionHeaders(config, IDS.userB, IDS.homeB);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const refused = await send(base, `/api/pages/${PAGE}/blocks`, asViewer, append({ blocks: BLOCKS, idempotencyKey: 'append-key-2' }));
			assert.equal(refused.status, 403, refused.text);
			const patched = await send(base, `/api/pages/${PAGE}`, asViewer, { method: 'PATCH', body: JSON.stringify({ content: EDITED }) });
			assert.equal(patched.status, refused.status, patched.text);
			assert.deepEqual(rpcCalls(mock), []);
		});
	});

	it('answers a page the caller cannot read like the PATCH does', async () => {
		const mock = createPostgrestMock(world(), { rpc: { osionos_page_append: appendRpc } });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const refused = await send(base, `/api/pages/${IDS.pageB}/blocks`, asOwner, append({ blocks: BLOCKS, idempotencyKey: 'append-key-3' }));
			assert.equal(refused.status, 404, refused.text);
			const patched = await send(base, `/api/pages/${IDS.pageB}`, asOwner, { method: 'PATCH', body: JSON.stringify({ content: EDITED }) });
			assert.equal(patched.status, refused.status, patched.text);
			assert.deepEqual(rpcCalls(mock), []);
		});
	});

	it('answers an archived page with a 404', async () => {
		const seeded = world();
		seeded.osionos_pages.find((row) => row.id === PAGE).archived_at = '2026-10-10T00:00:00.000Z';
		const mock = createPostgrestMock(seeded, { rpc: { osionos_page_append: appendRpc } });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const refused = await send(base, `/api/pages/${PAGE}/blocks`, asOwner, append({ blocks: BLOCKS, idempotencyKey: 'append-key-4' }));
			assert.equal(refused.status, 404, refused.text);
			assert.deepEqual(rpcCalls(mock), []);
		});
	});

	it('refuses an invalid payload before any BaaS call', async () => {
		const invalid = [
			['no blocks at all', { idempotencyKey: 'append-key-5' }],
			['an empty block list', { blocks: [], idempotencyKey: 'append-key-5' }],
			['more than 100 blocks', { blocks: Array.from({ length: 101 }, (_, index) => ({ id: `b${index}` })), idempotencyKey: 'append-key-5' }],
			['a block without an id', { blocks: [{ type: 'paragraph' }], idempotencyKey: 'append-key-5' }],
			['blocks over 256 KB', { blocks: [{ id: 'b1', content: 'x'.repeat(300 * 1024) }], idempotencyKey: 'append-key-5' }],
			['a short idempotency key', { blocks: BLOCKS, idempotencyKey: 'short' }],
			['a long idempotency key', { blocks: BLOCKS, idempotencyKey: 'k'.repeat(129) }],
			['an idempotency key with other characters', { blocks: BLOCKS, idempotencyKey: 'append key!' }],
		];
		for (const [name, body] of invalid) {
			const mock = createPostgrestMock(world(), { rpc: { osionos_page_append: appendRpc } });
			await withBridge(config, mock.fetchImpl, async (base) => {
				const refused = await send(base, `/api/pages/${PAGE}/blocks`, asOwner, append(body));
				assert.equal(refused.status, 400, `${name}: ${refused.text}`);
				assert.deepEqual(mock.calls, [], name);
			});
		}
	});
});
