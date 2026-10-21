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

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const strictConfig = harnessConfig({ env: { OSIONOS_PAGE_STRICT_VERSION: '1' } });
const PAGE = IDS.sharedA;
const STORED = [{ id: 'b1', type: 'paragraph', content: 'stored text' }];
const EDITED = [{ id: 'b2', type: 'paragraph', content: 'edited text' }];
const asOwner = sessionHeaders(config, IDS.userA, IDS.homeA);

function world(version = 4) {
	const seeded = teamWorld();
	const page = seeded.osionos_pages.find((row) => row.id === PAGE);
	page.version = version;
	page.content = STORED;
	return seeded;
}

/** The row write the bridge made — the one that carries the version filter. */
const pageWrite = (mock) => mock.calls.find((call) => call.method === 'PATCH' && call.table === 'osionos_pages');

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

	it('accepts an edit that carries no content', async () => {
		const mock = createPostgrestMock(world());
		await withBridge(strictConfig, mock.fetchImpl, async (base) => {
			const ok = await send(base, `/api/pages/${PAGE}`, asOwner, patch({ title: 'Renamed' }));
			assert.equal(ok.status, 200, ok.text);
			assert.equal(mock.page(PAGE).title, 'Renamed');
		});
	});
});
