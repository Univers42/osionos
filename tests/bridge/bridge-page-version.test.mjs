/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-version.test.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The page PATCH's version precondition. A stale baseVersion is a 409 that carries
// the server's own copy, a current one is a 200 that carries the row's new version,
// and a baseVersion that is not a plain non-negative integer never reaches the BaaS
// at all — the filter it would land in is string-built.
//
// The wire shape matters as much as the outcome: a versioned PATCH asks for the
// version and nothing else (the editor flushes every ~800 ms — the whole row, with
// its content JSONB and its search_doc tsvector, must not ride back each time),
// while the legacy PATCH stays the request it always was, so it still works against
// a database that has no version column yet.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const strictConfig = harnessConfig({ env: { OSIONOS_PAGE_STRICT_VERSION: '1' } });
const PAGE = IDS.sharedA;
const STORED = [{ id: 'b1', type: 'paragraph', content: 'stored text' }];
const EDITED = [{ id: 'b2', type: 'paragraph', content: 'edited text' }];
const asOwner = sessionHeaders(config, IDS.userA, IDS.homeA);

/** The legacy PATCH's query string, byte for byte: the one the page write always sent. */
const LEGACY_QUERY = `id=eq.${PAGE}`;

function world(version = 4) {
	const seeded = teamWorld();
	const page = seeded.osionos_pages.find((row) => row.id === PAGE);
	page.version = version;
	page.content = STORED;
	return seeded;
}

/** The row write the bridge made — the one that carries the version filter. */
const pageWrite = (mock) => mock.calls.find((call) => call.method === 'PATCH' && call.table === 'osionos_pages');

/**
 * The mock with a concurrent write: the row moves on (another writer, at version 5)
 * between the strict read and the PATCH, so the versioned PATCH finds no row to
 * write — the same answer PostgREST gives when the filter matches nothing.
 */
function withConcurrentWrite(mock, { version = 5, content = EDITED } = {}) {
	return async (url, init = {}) => {
		if ((init.method ?? 'GET') === 'PATCH' && String(url).includes('/rest/v1/osionos_pages')) {
			const row = mock.page(PAGE);
			if (row) {
				row.version = version;
				row.content = content;
			}
		}
		return mock.fetchImpl(url, init);
	};
}

describe('a page PATCH that carries a baseVersion', () => {
	it('refuses a stale baseVersion with the server copy and changes nothing', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const stale = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ baseVersion: 3, content: EDITED }));
			assert.equal(stale.status, 409, stale.text);
			assert.equal(stale.body.ok, false);
			assert.equal(stale.body.code, 'version_conflict');
			assert.equal(stale.body.details.version, 4);
			assert.deepEqual(stale.body.details.content, STORED);
			// The write was attempted with the version filter — that filter is what said no.
			const write = pageWrite(mock);
			assert.equal(write.params.get('version'), 'eq.3');
			assert.match(write.prefer, /return=representation/);
			assert.deepEqual(mock.page(PAGE).content, STORED);
		});
	});

	it('accepts a current baseVersion and answers the row\'s new version', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const ok = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ baseVersion: 4, content: EDITED }));
			assert.equal(ok.status, 200, ok.text);
			assert.equal(ok.body.version, 5);
			assert.deepEqual(mock.page(PAGE).content, EDITED);
			assert.equal(pageWrite(mock).params.get('version'), 'eq.4');
		});
	});

	it('refuses a baseVersion that is not an integer before any BaaS call', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const refused = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ baseVersion: '1 or id=neq.x' }));
			assert.equal(refused.status, 400, refused.text);
			assert.deepEqual(mock.calls, []);
		});
	});

	it('never puts the baseVersion in the row', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const ok = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ baseVersion: 4, title: 'Renamed', content: EDITED }));
			assert.equal(ok.status, 200, ok.text);
			assert.deepEqual(Object.keys(pageWrite(mock).body).sort(), ['content', 'title', 'updated_at']);
		});
	});

	it('asks for the version and nothing else — the row does not ride back', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const ok = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ baseVersion: 4, content: EDITED }));
			assert.equal(ok.status, 200, ok.text);
			const write = pageWrite(mock);
			assert.equal(write.params.get('id'), `eq.${PAGE}`);
			assert.equal(write.params.get('version'), 'eq.4');
			// Without this select PostgREST echoes the whole row — the content JSONB
			// and the search_doc tsvector — on every editor flush, to read one number.
			assert.equal(write.params.get('select'), 'version');
			assert.equal(write.prefer, 'return=representation');
			// The answer carries the row's new version — the only column that came back.
			assert.equal(ok.body.version, 5);
		});
	});
});

describe('a page PATCH without a baseVersion', () => {
	it('keeps today\'s behaviour while the strict flag is off', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const ok = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ content: EDITED }));
			assert.equal(ok.status, 200, ok.text);
			assert.deepEqual(mock.page(PAGE).content, EDITED);
			assert.equal(pageWrite(mock).params.get('version'), null);
		});
	});

	it('sends the legacy request byte for byte — no select, no version column', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const ok = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ content: EDITED }));
			assert.equal(ok.status, 200, ok.text);
			const write = pageWrite(mock);
			// The query the legacy PATCH always sent: the page by id, nothing else.
			assert.equal(write.params.toString(), LEGACY_QUERY);
			assert.equal(write.params.get('select'), null);
			assert.equal(write.params.get('version'), null);
			assert.equal(write.prefer, 'return=minimal');
			// The row it wrote is the legacy row — the version is not in it either.
			assert.deepEqual(Object.keys(write.body).sort(), ['content', 'updated_at']);
			// Nothing in the request names the version column, so it still works
			// against a database that has no version column yet (the migration ships
			// separately) — and the answer says so.
			assert.equal('version' in write.body, false);
			assert.equal(ok.body.version, null);
		});
	});
});

describe('the strict flag refuses a content edit that carries no version', () => {
	it('refuses a content edit that differs from the stored content', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(strictConfig, mock.fetchImpl, async (base) => {
			const refused = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ content: EDITED }));
			assert.equal(refused.status, 409, refused.text);
			assert.equal(refused.body.code, 'version_conflict');
			assert.equal(refused.body.details.version, 4);
			assert.deepEqual(refused.body.details.content, STORED);
			assert.deepEqual(mock.page(PAGE).content, STORED);
		});
	});

	it('accepts a content edit that equals the stored content', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(strictConfig, mock.fetchImpl, async (base) => {
			const ok = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ content: STORED }));
			assert.equal(ok.status, 200, ok.text);
			assert.deepEqual(mock.page(PAGE).content, STORED);
		});
	});

	it('writes under the version it read', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(strictConfig, mock.fetchImpl, async (base) => {
			const ok = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ content: STORED }));
			assert.equal(ok.status, 200, ok.text);
			const write = pageWrite(mock);
			// The comparison read the row; the write is pinned to that version, so a
			// write landing in between is not overwritten with the caller's content.
			assert.equal(write.params.get('version'), 'eq.4');
			assert.equal(write.params.get('select'), 'version');
			assert.equal(write.prefer, 'return=representation');
			assert.equal(ok.body.version, 4);
		});
	});

	it('refuses a write that lost the race between the read and the PATCH', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(strictConfig, withConcurrentWrite(mock), async (base) => {
			const refused = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ content: STORED }));
			assert.equal(refused.status, 409, refused.text);
			assert.equal(refused.body.code, 'version_conflict');
			// The server's copy — the other writer's content, at its version.
			assert.equal(refused.body.details.version, 5);
			assert.deepEqual(refused.body.details.content, EDITED);
			// The write was pinned to the version the read saw.
			const write = pageWrite(mock);
			assert.equal(write.params.get('version'), 'eq.4');
			assert.equal(write.params.get('select'), 'version');
			// Their write stands; ours never landed.
			assert.deepEqual(mock.page(PAGE).content, EDITED);
		});
	});

	it('accepts an edit that carries no content', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(strictConfig, mock.fetchImpl, async (base) => {
			const ok = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ title: 'Renamed' }));
			assert.equal(ok.status, 200, ok.text);
			assert.equal(mock.page(PAGE).title, 'Renamed');
		});
	});
});
