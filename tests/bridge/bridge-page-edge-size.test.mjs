// The edge (grobase WAF) refuses an osionos_pages body over 128 KB with a 400, which the
// bridge used to pass on as a 502: the client read it as transient, retried forever and
// stalled every page queued behind it (live, 2026-10-28). The bridge now refuses the
// write itself with a 413 the client can act on, before anything reaches the edge.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);
const contentOf = (bytes) => [{ id: 'b1', type: 'paragraph', content: 'x'.repeat(bytes) }];

describe('page writes over the edge body limit', () => {
	it('answers 413 page_too_large and sends nothing to the edge', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/pages/${IDS.sharedA}`, asA, patch({ content: contentOf(140 * 1024) }));
			assert.equal(answer.status, 413, answer.text);
			assert.match(answer.text, /page_too_large|too large/i);
			const page = mock.rows('osionos_pages').find((row) => row.id === IDS.sharedA);
			assert.equal(page.content[0].content, 'shared text that links to the B page');
		});
	});

	it('still saves a page under the limit', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const answer = await send(base, `/api/pages/${IDS.sharedA}`, asA, patch({ content: contentOf(100 * 1024) }));
			assert.equal(answer.status, 200, answer.text);
			const page = mock.rows('osionos_pages').find((row) => row.id === IDS.sharedA);
			assert.equal(page.content[0].content.length, 100 * 1024);
		});
	});
});
