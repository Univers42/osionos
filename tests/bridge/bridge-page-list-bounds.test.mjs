/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-list-bounds.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The paths that read page CONTENT walk the workspace in keyset chunks instead of
// asking for every row at once: a workspace with thousands of pages must never
// produce one response big enough to take the shared PostgREST down. The paths
// that read metadata only (the /api/pages/all hydrate, the page graph) keep their
// single request, and the graph additionally never receives content or archived rows.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asTeamOwner = sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);
const CHUNK = 200;
const MAX_BYTES = 16 * 1024 * 1024;

// Fixed-width hex so the id order of the seed is the same raw string order the
// bridge, the cursor filter and Postgres all compare on.
const uuidFor = (index) => `f0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;

function seedPage(index, overrides = {}) {
	const id = uuidFor(index);
	return {
		id,
		workspace_id: IDS.team,
		owner_id: IDS.userA,
		visibility: 'private',
		title: `Page ${index}`,
		collaborators: [],
		properties: [],
		parent_page_id: null,
		archived_at: null,
		content: [{ id: `${id}-b1`, type: 'paragraph', content: `body ${index}` }],
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
		...overrides,
		id,
	};
}

/** The team members a workspace-gated page read needs, with `pages` as the workspace's rows. */
function worldOf(pages, links = []) {
	const world = teamWorld();
	world.osionos_pages = pages;
	world.osionos_page_links = links;
	return world;
}

/**
 * A members-anchored page read (the list paths) seen as the page read it carries: the nested
 * `workspace.pages.` params become the page params and the select is the pages' own.
 */
function pageReadOf(call) {
	const params = new URLSearchParams();
	for (const [key, value] of call.params) {
		if (key.startsWith('workspace.pages.')) params.set(key.slice('workspace.pages.'.length), value);
	}
	params.set('select', /osionos_pages!workspace_id\((.*)\)\)$/.exec(call.params.get('select'))[1]);
	return { table: 'osionos_pages', params };
}

const pageReads = (mock) => mock.calls
	.filter((call) => call.table === 'osionos_pages' || (call.table === 'osionos_workspace_members' && call.params.get('select').includes('osionos_pages!')))
	.map((call) => (call.table === 'osionos_pages' ? call : pageReadOf(call)));
const scanReads = (mock) => pageReads(mock).filter((call) => !call.params.has('search_doc'));

/** Ids in the order the chunk scan walks them: raw string order, like Postgres' uuid order. */
const idOrder = (pages) => pages.map((page) => page.id).sort();

/** `ORDER BY updated_at DESC, id ASC`, nulls first as Postgres orders a DESC column. */
function expectedPageOrder(pages) {
	return [...pages]
		.sort((left, right) => {
			if (left.updated_at === right.updated_at) return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
			if (left.updated_at === null) return -1;
			if (right.updated_at === null) return 1;
			return left.updated_at > right.updated_at ? -1 : 1;
		})
		.map((page) => page.id);
}

/** The rank the legacy scan gives a row: title prefix > title substring > content hit. */
function legacyRank(page, query) {
	const title = String(page.title || 'Untitled').toLowerCase();
	const at = title.indexOf(query);
	if (at === 0) return 3;
	if (at > 0) return 2;
	return JSON.stringify(page.content ?? '').toLowerCase().includes(query) ? 1 : -1;
}

/** The order the legacy scan answers in: best rank first, newest first inside a rank. */
function expectedLegacyOrder(pages, query) {
	return pages
		.filter((page) => !page.archived_at)
		.map((page) => ({ page, rank: legacyRank(page, query) }))
		.filter((entry) => entry.rank >= 0)
		.sort((left, right) => right.rank - left.rank
			|| (left.page.updated_at > right.page.updated_at ? -1 : left.page.updated_at < right.page.updated_at ? 1 : 0))
		.map((entry) => entry.page.id);
}

/** No page read that carries content may be asked for without a row limit. A read with
 * no `select` counts too: PostgREST answers every column then, content included. */
function assertEveryContentReadIsBounded(mock, label) {
	const unbounded = pageReads(mock)
		.filter((call) => !call.params.has('limit'))
		.filter((call) => !call.params.has('select') || call.params.get('select') === '*' || String(call.params.get('select')).includes('content'));
	assert.deepEqual(unbounded.map(String), [], `${label}: no unbounded page read carrying content`);
}

const TIE_STAMPS = [
	'2026-04-01T00:00:00.000Z',
	'2026-03-01T00:00:00.000Z',
	'2026-02-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z',
];

/** `count` pages whose updated_at repeats on purpose, so the id tie-break is observable. */
function tiedPages(count) {
	return Array.from({ length: count }, (unused, index) => seedPage(index, {
		updated_at: index === count - 1 ? null : TIE_STAMPS[index % TIE_STAMPS.length],
	}));
}

describe('the filtered page list walks the workspace in keyset chunks', () => {
	it('reads 450 pages newest first with a bounded chunk request per 200 rows', async () => {
		const pages = tiedPages(450);
		const ids = idOrder(pages);
		const mock = createPostgrestMock(worldOf(pages));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const listed = await send(base, `/api/pages?workspaceId=${IDS.team}`, asTeamOwner);
			assert.equal(listed.status, 200, listed.text);
			assertEveryContentReadIsBounded(mock, '/api/pages');

			const reads = pageReads(mock);
			assert.ok(reads.length >= 3, `expected at least 3 page reads, got ${reads.length}`);
			for (const read of reads) {
				assert.equal(read.params.get('select'), '*');
				assert.equal(read.params.get('order'), 'id.asc');
				assert.equal(read.params.get('limit'), String(CHUNK));
			}
			// 450 rows over chunks of 200: the second read starts after row 200, the third
			// after row 400 — so the last one carries the remaining 50.
			assert.equal(reads[0].params.get('id'), null);
			assert.equal(reads[1].params.get('id'), `gt.${ids[199]}`);
			assert.equal(reads[2].params.get('id'), `gt.${ids[399]}`);
			assert.equal(reads.length, 3, 'a short last chunk ends the scan');

			assert.equal(listed.body.length, 450);
			assert.deepEqual(listed.body.map((entry) => entry._id), expectedPageOrder(pages));
			const ties = listed.body.filter((entry) => entry.updatedAt === TIE_STAMPS[0]);
			assert.ok(ties.length > 1, 'the seed has repeated updated_at values to order');
			assert.deepEqual(
				ties.map((entry) => entry._id),
				ids.filter((id) => pages.find((page) => page.id === id).updated_at === TIE_STAMPS[0]),
				'rows sharing updated_at come back id ascending',
			);
			assert.equal(listed.body[0]._id, ids[449], 'the row without updated_at sorts first, as Postgres orders DESC');
			// Literal ends, independent of expectedPageOrder: index i carries TIE_STAMPS[i % 4].
			assert.equal(listed.body[1]._id, ids[0], 'the newest updated_at comes right after it, lowest id first');
			assert.equal(listed.body.at(-1)._id, ids[447], 'the oldest updated_at comes last, highest id last');
			assert.equal(pages.find((page) => page.id === ids[449]).updated_at, null, 'that row really carries no updated_at');
		});
	});

	it('asks for one empty chunk when the workspace is an exact multiple of the chunk size', async () => {
		const pages = tiedPages(400);
		const ids = idOrder(pages);
		const mock = createPostgrestMock(worldOf(pages));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const listed = await send(base, `/api/pages?workspaceId=${IDS.team}`, asTeamOwner);
			assert.equal(listed.status, 200, listed.text);
			assertEveryContentReadIsBounded(mock, '/api/pages');

			const reads = pageReads(mock);
			assert.equal(reads.length, 3, 'the last chunk is empty and still asked for');
			assert.equal(reads[2].params.get('id'), `gt.${ids[399]}`);
			assert.equal(reads[2].params.get('limit'), String(CHUNK));
			assert.equal(listed.body.length, 400);
			assert.deepEqual(listed.body.map((entry) => entry._id), expectedPageOrder(pages));
		});
	});

	it('stops at the byte cap and answers 413 instead of a partial list', async () => {
		const heavy = 'x'.repeat(4 * 1000 * 1000);
		const pages = Array.from({ length: 205 }, (unused, index) => seedPage(index, index < 200
			? { updated_at: TIE_STAMPS[index % TIE_STAMPS.length] }
			: { updated_at: TIE_STAMPS[index % TIE_STAMPS.length], content: [{ id: `${uuidFor(index)}-b1`, type: 'paragraph', content: heavy }] }));
		const mock = createPostgrestMock(worldOf(pages));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const listed = await send(base, `/api/pages?workspaceId=${IDS.team}`, asTeamOwner);
			assert.equal(listed.status, 413, listed.text);
			assert.equal(listed.body.ok, false);
			assert.deepEqual(listed.body, { ok: false, message: listed.body.message });
			assert.equal(pageReads(mock).length, 2, 'the scan stops at the chunk that crossed the cap');

			const size = Number(/(\d+) bytes/.exec(listed.body.message)?.[1]);
			assert.ok(size > MAX_BYTES, `the message names the size reached: ${listed.body.message}`);
			assert.match(listed.body.message, /parentPageId/);
			assert.match(listed.body.message, /databaseId/);
			assert.match(listed.body.message, /\/api\/pages\/all/);
		});
	});
});

describe('the paths that read page content stay bounded', () => {
	it('sends no page read that carries content without a row limit', async () => {
		const pages = tiedPages(450);
		const mock = createPostgrestMock(worldOf(pages));
		await withBridge(config, mock.fetchImpl, async (base) => {
			for (const path of [
				`/api/pages?workspaceId=${IDS.team}`,
				`/api/pages?workspaceId=${IDS.team}&parentPageId=${IDS.missing}`,
				`/api/pages/search?workspaceId=${IDS.team}&q=body`,
				`/api/graph/pages?workspaceId=${IDS.team}`,
			]) {
				const answer = await send(base, path, asTeamOwner);
				assert.ok(answer.status < 500, `${path} answered ${answer.status}`);
				assertEveryContentReadIsBounded(mock, path);
			}
			const withLimit = pageReads(mock).filter((call) => call.params.has('limit'));
			assert.ok(withLimit.length >= 3, `the content reads are the bounded ones: ${withLimit.length}`);
		});
	});
});

describe('the page graph reads metadata only', () => {
	// 3 is archived, so it is neither a node nor a parent an edge can point at; 4 stays a
	// live node even though its only parent is the archived page.
	const GRAPH_PAGES = [
		seedPage(0, { updated_at: TIE_STAMPS[0], properties: [{ key: 'links', label: 'Links', type: 'relation', value: [uuidFor(2)] }] }),
		seedPage(1, { updated_at: TIE_STAMPS[1], parent_page_id: uuidFor(0) }),
		seedPage(2, { updated_at: TIE_STAMPS[2], surface: 'folder' }),
		seedPage(3, { updated_at: TIE_STAMPS[3], archived_at: '2026-05-01T00:00:00.000Z' }),
		seedPage(4, { updated_at: TIE_STAMPS[0], parent_page_id: uuidFor(3) }),
	];
	const nodeId = (id) => `osionos:osionos_pages:${id}`;
	const expectedNodes = [uuidFor(0), uuidFor(1), uuidFor(2), uuidFor(4)].sort();
	const expectedEdges = [`parent:${uuidFor(1)}`, `rel:${uuidFor(0)}:${uuidFor(2)}`].sort();

	it('/api/graph/pages reads non-archived metadata rows and builds the same graph', async () => {
		const mock = createPostgrestMock(worldOf(GRAPH_PAGES));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const graph = await send(base, `/api/graph/pages?workspaceId=${IDS.team}`, asTeamOwner);
			assert.equal(graph.status, 200, graph.text);
			assertEveryContentReadIsBounded(mock, '/api/graph/pages');

			const reads = pageReads(mock);
			assert.equal(reads.length, 1, 'the graph reads each workspace once');
			const select = reads[0].params.get('select');
			assert.notEqual(select, '*');
			assert.equal(select.includes('content'), false, `content must not be selected: ${select}`);
			assert.equal(select.startsWith('id,title,'), true);
			assert.equal(reads[0].params.get('archived_at'), 'is.null');
			assert.equal(reads[0].params.has('limit'), false, 'metadata only needs one request');

			assert.deepEqual(graph.body.nodes.map((node) => node.id).sort(), expectedNodes.map(nodeId));
			assert.deepEqual(graph.body.edges.map((edge) => edge.id).sort(), expectedEdges);
			assert.equal(graph.body.nodes.some((node) => node.pk === uuidFor(3)), false, 'an archived page is not a node');
			assert.equal(graph.body.edges.some((edge) => edge.id === `parent:${uuidFor(4)}`), false);
		});
	});

	it('/api/graph/data reads the same metadata rows across the account scope', async () => {
		const mock = createPostgrestMock(worldOf(GRAPH_PAGES));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const graph = await send(base, '/api/graph/data?scope=account', asTeamOwner);
			assert.equal(graph.status, 200, graph.text);
			assertEveryContentReadIsBounded(mock, '/api/graph/data');

			const reads = pageReads(mock);
			assert.ok(reads.length >= 1);
			for (const read of reads) {
				assert.equal(read.params.get('archived_at'), 'is.null');
				assert.equal(read.params.get('select').includes('content'), false);
				assert.notEqual(read.params.get('select'), '*');
			}
			assert.deepEqual(
				graph.body.nodes.filter((node) => node.data?.workspaceId === IDS.team).map((node) => node.pk).sort(),
				expectedNodes,
			);
		});
	});
});

describe('the /api/pages/all hydrate keeps one request', () => {
	it('asks once for every metadata row, with no limit and no keyset cursor', async () => {
		const pages = tiedPages(450);
		const mock = createPostgrestMock(worldOf(pages));
		await withBridge(config, mock.fetchImpl, async (base) => {
			const listed = await send(base, `/api/pages/all?workspaceId=${IDS.team}`, asTeamOwner);
			assert.equal(listed.status, 200, listed.text);
			assertEveryContentReadIsBounded(mock, '/api/pages/all');

			const reads = pageReads(mock);
			assert.equal(reads.length, 1);
			assert.equal(reads[0].params.has('limit'), false);
			assert.equal(reads[0].params.has('id'), false);
			assert.equal(reads[0].params.get('order'), 'updated_at.desc');
			assert.equal(reads[0].params.get('select').includes('content'), false);
			// The single request asks PostgREST for updated_at.desc and the embed stub applies it,
			// so the list comes back in that order (nulls first, ties in seed order = id ascending).
			assert.equal(listed.body.length, 450);
			assert.deepEqual(listed.body.map((entry) => entry._id), expectedPageOrder(pages));
		});
	});
});

describe('the search fallback scans in bounded chunks', () => {
	const MISSING_COLUMN = { status: 400, body: { code: '42703', details: null, hint: null, message: 'column osionos_pages.search_doc does not exist' } };

	it('ranks the same hits as an unbounded scan and asks for bounded reads', async () => {
		const query = 'needle';
		const pages = [
			seedPage(900, { title: 'Needle at the start', updated_at: '2026-06-01T00:00:00.000Z' }),
			seedPage(901, { title: 'Notes about a needle', updated_at: '2026-05-01T00:00:00.000Z' }),
			seedPage(902, { title: 'Filler', updated_at: '2026-04-01T00:00:00.000Z', content: [{ id: `${uuidFor(902)}-b1`, type: 'paragraph', content: 'a body holding the needle' }] }),
			...Array.from({ length: 247 }, (unused, index) => seedPage(index, { updated_at: TIE_STAMPS[index % TIE_STAMPS.length] })),
		];
		const mock = createPostgrestMock(worldOf(pages), { failWhen: (call) => (call.params.has('search_doc') ? MISSING_COLUMN : null) });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const found = await send(base, `/api/pages/search?workspaceId=${IDS.team}&q=${query}`, asTeamOwner);
			assert.equal(found.status, 200, found.text);
			assertEveryContentReadIsBounded(mock, '/api/pages/search');

			const reads = scanReads(mock);
			assert.equal(reads.length, 2, 'the 250-page scan crosses one chunk boundary');
			for (const read of reads) {
				assert.equal(read.params.get('limit'), String(CHUNK));
				assert.equal(read.params.get('order'), 'id.asc');
				assert.equal(read.params.get('select'), '*');
			}
			assert.equal(reads[0].params.has('id'), false);
			assert.equal(reads[1].params.get('id'), `gt.${uuidFor(199)}`);
			assert.deepEqual(found.body.map((entry) => entry._id), expectedLegacyOrder(pages, query));
		});
	});
});