/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-private-pages.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A member reads only the pages the client rule allows: every page read site answers
// member B (a viewer of A's team workspace) without A's private pages, and a single
// page B may not read answers exactly like a missing id.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, SECRET, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const asB = sessionHeaders(config, IDS.userB, IDS.homeB);

const ids = (entries) => entries.map((entry) => entry._id ?? entry.id).sort();
const refIds = (refs) => refs.map((ref) => ref.id).sort();
const visibleToB = [IDS.sharedA, IDS.sharedMemoA, IDS.pageB].sort();

async function assertSameAsMissing(base, pathFor, init) {
	const denied = await send(base, pathFor(IDS.privateA), asB, init);
	const missing = await send(base, pathFor(IDS.missing), asB, init);
	assert.equal(denied.status, 404, denied.text);
	assert.equal(denied.status, missing.status);
	assert.deepEqual(denied.body, missing.body);
}

describe('page list and read show a member only readable pages', () => {
	it('lists only pages B may read on /api/pages and /api/pages/all', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			for (const path of ['/api/pages', '/api/pages/all']) {
				const listed = await send(base, `${path}?workspaceId=${IDS.team}`, asB);
				assert.equal(listed.status, 200, listed.text);
				assert.deepEqual(ids(listed.body), visibleToB, path);
				assert.equal(listed.text.includes(SECRET), false, path);
			}
		});
	});

	it('404s a private page exactly like a missing id, and still serves a shared one', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			await assertSameAsMissing(base, (id) => `/api/pages/${id}`);
			assert.equal((await send(base, `/api/pages/${IDS.sharedA}`, asB)).status, 200);
		});
	});

	it('lets the owner read their private page when the token id is upper-case', async () => {
		const mock = createPostgrestMock(teamWorld());
		const asUpperA = sessionHeaders(config, IDS.userA.toUpperCase(), IDS.homeA);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const read = await send(base, `/api/pages/${IDS.privateA}`, asUpperA);
			assert.equal(read.status, 200, read.text);
			assert.equal(read.text.includes(SECRET), true);
		});
	});
});

describe('search returns only readable pages', () => {
	const missingColumn = { status: 400, body: { code: '42703', details: null, hint: null, message: 'column osionos_pages.search_doc does not exist' } };
	const scans = (mock) => mock.calls.filter((call) => call.table === 'osionos_pages' && !call.params.has('search_doc'));

	it('filters full-text hits by the read rule', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const secret = await send(base, `/api/pages/search?workspaceId=${IDS.team}&q=${SECRET}`, asB);
			assert.equal(secret.status, 200, secret.text);
			assert.deepEqual(secret.body, []);
			const notes = await send(base, `/api/pages/search?workspaceId=${IDS.team}&q=notes`, asB);
			assert.deepEqual(ids(notes.body), visibleToB);
		});
	});

	it('falls back to a filtered scan only when the search_doc column is missing', async () => {
		const mock = createPostgrestMock(teamWorld(), { failWhen: (call) => (call.params.has('search_doc') ? missingColumn : null) });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const secret = await send(base, `/api/pages/search?workspaceId=${IDS.team}&q=${SECRET}`, asB);
			assert.equal(secret.status, 200, secret.text);
			assert.deepEqual(secret.body, []);
			assert.equal(scans(mock).length, 1, 'the fallback scan ran');
			const notes = await send(base, `/api/pages/search?workspaceId=${IDS.team}&q=notes`, asB);
			assert.deepEqual(ids(notes.body), visibleToB);
		});
	});

	it('answers 5xx without scanning on any other search failure', async () => {
		const badRequest = { status: 400, body: { code: 'PGRST100', message: 'failed to parse filter' } };
		const mock = createPostgrestMock(teamWorld(), { failWhen: (call) => (call.params.has('search_doc') ? badRequest : null) });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/search?workspaceId=${IDS.team}&q=notes`, asB);
			assert.ok(result.status >= 500, `${result.status} ${result.text}`);
			assert.equal(scans(mock).length, 0, 'no scan request was made');
		});
	});
});

describe('translate works only on a readable page', () => {
	it('treats a private page like a missing id and never calls a translator with its content', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const denied = await send(base, `/api/pages/${IDS.privateA}/translate`, asB, post({ targetLocale: 'fr' }));
			const missing = await send(base, `/api/pages/${IDS.missing}/translate`, asB, post({ targetLocale: 'fr' }));
			assert.equal(denied.status, missing.status, denied.text);
			const comparable = ({ pageId, translatedAt, ...rest }) => rest;
			assert.deepEqual(comparable(denied.body), comparable(missing.body));
			assert.equal(denied.text.includes(SECRET), false);
			assert.deepEqual(mock.outbound, [], 'no translator was called');
			await send(base, `/api/pages/${IDS.privateA}/translate`, asA, post({ targetLocale: 'fr' }));
			assert.ok(mock.outbound.length > 0, 'control: the owner translation does reach a translator');
		});
	});
});

describe('backlinks show only readable pages', () => {
	it('404s a private target like a missing id', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => assertSameAsMissing(base, (id) => `/api/pages/${id}/backlinks`));
	});

	it('drops private linking and mentioning pages, keeps shared ones', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.pageB}/backlinks`, asB);
			assert.equal(result.status, 200, result.text);
			assert.deepEqual(refIds(result.body.linked), [IDS.sharedA]);
			assert.deepEqual(refIds(result.body.mentions), [IDS.sharedMemoA]);
		});
	});

	it('drops a shared linking page that moved to a workspace the caller is not in', async () => {
		const world = teamWorld();
		world.osionos_pages.find((row) => row.id === IDS.sharedA).workspace_id = IDS.homeA;
		const mock = createPostgrestMock(world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const result = await send(base, `/api/pages/${IDS.pageB}/backlinks`, asB);
			assert.equal(result.status, 200, result.text);
			assert.deepEqual(refIds(result.body.linked), []);
		});
	});
});

describe('comments and publishing need a readable page', () => {
	it('404s listing and posting comments on a private page like a missing id', async () => {
		const mock = createPostgrestMock(teamWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			await assertSameAsMissing(base, (id) => `/api/comments?pageId=${id}`);
			await assertSameAsMissing(base, () => '/api/comments', post({ pageId: IDS.privateA, content: 'hi' }));
			assert.deepEqual(mock.rows('osionos_page_comments'), []);
			assert.deepEqual(mock.rows('osionos_notifications'), []);
			const control = await send(base, '/api/comments', asB, post({ pageId: IDS.sharedA, content: 'hi' }));
			assert.equal(control.status, 200, control.text);
		});
	});

	it('404s publishing a private page like a missing id', async () => {
		const mock = createPostgrestMock(teamWorld());
		const previous = process.env.OSIONOS_PUBLISH_ENABLED;
		process.env.OSIONOS_PUBLISH_ENABLED = '1';
		try {
			await withBridge(config, mock.fetchImpl, async (base) => {
				const denied = await send(base, `/api/pages/${IDS.privateA}/publish`, asB, { method: 'POST' });
				const missing = await send(base, `/api/pages/${IDS.missing}/publish`, asB, { method: 'POST' });
				assert.equal(denied.status, 404, denied.text);
				assert.deepEqual([denied.status, denied.body], [missing.status, missing.body]);
				assert.deepEqual(mock.rows('osionos_published_pages'), []);
			});
		} finally {
			if (previous === undefined) delete process.env.OSIONOS_PUBLISH_ENABLED;
			else process.env.OSIONOS_PUBLISH_ENABLED = previous;
		}
	});
});
