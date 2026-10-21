/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-graph-links.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

/**
 * The truth table of the graph's access control (C99).
 *
 * The rows are the ways a page can stop being readable; the columns are the
 * surfaces that read the graph. Every cell must be 0 for the caller who may
 * not read the page: the page must not appear as a node, as an endpoint of an
 * edge, as a backlink, or in any other place of the answer — and no indexer
 * runs between the change and the read, because the edges are read LIVE.
 */

const config = harnessConfig();

/** The pages of the truth table: three readable ones and the hidden one. */
const PAGES = {
	src: '11111111-1111-4111-8111-111111111111',
	dst: '22222222-2222-4222-8222-222222222222',
	probe: '33333333-3333-4333-8333-333333333333',
	elsewhere: '44444444-4444-4444-8444-444444444444',
};

/** A page of the truth table: shared, owned by A, in the team workspace. */
function page(id, over = {}) {
	return {
		id, workspace_id: IDS.team, owner_id: IDS.userA, visibility: 'shared', title: `Page ${id.slice(0, 4)}`,
		collaborators: [], properties: [], parent_page_id: null, archived_at: null, content: [],
		created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
		...over,
	};
}

/** The world of the table: the three pages, and the links between them. */
function truthWorld(over = {}) {
	const world = teamWorld();
	world.osionos_pages = [page(PAGES.src), page(PAGES.dst), page(PAGES.probe)];
	world.osionos_page_links = [
		{ source_page_id: PAGES.src, target_page_id: PAGES.dst, workspace_id: IDS.team },
		{ source_page_id: PAGES.probe, target_page_id: PAGES.src, workspace_id: IDS.team },
		{ source_page_id: PAGES.probe, target_page_id: PAGES.dst, workspace_id: IDS.team },
	];
	return Object.assign(world, over);
}

/**
 * The page a row hides, the state before the change, and the change itself.
 *
 * `before` builds the state the viewer could read (a collaborator, a shared
 * page); `after` is what happens, and the read comes right after it — no
 * indexer runs in between, because the edges are read LIVE.
 */
const ROWS = [
	['private src', PAGES.src, null, (world) => { world.osionos_pages[0].visibility = 'private'; }],
	['private dst', PAGES.dst, (world) => { world.osionos_pages[1].visibility = 'private'; }, null],
	['src archived', PAGES.src, null, (world) => { world.osionos_pages[0].archived_at = '2026-10-02T00:00:00.000Z'; }],
	['dst archived', PAGES.dst, null, (world) => { world.osionos_pages[1].archived_at = '2026-10-02T00:00:00.000Z'; }],
	['dst deleted', PAGES.dst, null, (world) => { world.osionos_pages = world.osionos_pages.filter((row) => row.id !== PAGES.dst); }],
	['dst moved to a workspace the viewer is not in', PAGES.dst, null, (world) => { world.osionos_pages[1].workspace_id = IDS.homeA; }],
	['src moved to a workspace the viewer is not in', PAGES.src, null, (world) => { world.osionos_pages[0].workspace_id = IDS.homeA; }],
	['collaborator removed', PAGES.dst, (world) => {
		world.osionos_pages[1].visibility = 'private';
		world.osionos_pages[1].collaborators = [{ userId: IDS.userB, role: 'viewer' }];
	}, (world) => { world.osionos_pages[1].collaborators = []; }],
	['shared turned private', PAGES.dst, null, (world) => { world.osionos_pages[1].visibility = 'private'; }],
	['membership removed', null, null, (world) => {
		world.osionos_workspace_members = world.osionos_workspace_members.filter(
			(member) => !(member.workspace_id === IDS.team && member.user_id === IDS.userB),
		);
	}],
];

/** The surfaces of the table: the graph, the graph with the records, and the backlinks. */
const SURFACES = [
	['graph/pages', (base, headers) => send(base, `/api/graph/pages?workspaceId=${IDS.team}`, headers)],
	['graph/data', (base, headers) => send(base, '/api/graph/data?scope=account', headers)],
	['backlinks', (base, headers) => send(base, `/api/pages/${PAGES.probe}/backlinks`, headers)],
];

/** The ids the answer must not carry: the hidden one, and the whole team for a lost membership. */
function forbiddenIds(hidden) {
	return hidden === null ? [PAGES.src, PAGES.dst, PAGES.probe] : [hidden];
}

describe('the truth table of the graph (C99)', () => {
	for (const [name, hidden, before, after] of ROWS) {
		it(`${name}: every surface says nothing about it`, async () => {
			const world = truthWorld();
			if (before) before(world);
			if (after) after(world);
			const mock = createPostgrestMock(world);
			await withBridge(config, mock.fetchImpl, async (base) => {
				// The token of B carries the team workspace, minted before the change.
				const headers = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);
				const cells = [];
				for (const [surface, call] of SURFACES) {
					const response = await call(base, headers);
					const body = JSON.stringify(response.body ?? {});
					const leaks = forbiddenIds(hidden).filter((id) => body.includes(id)).length;
					cells.push(`${surface} ${leaks}`);
					for (const id of forbiddenIds(hidden)) {
						assert.ok(!body.includes(id), `${surface} mentions ${id}`);
					}
				}
				console.log(`[truth] ${name} | ${cells.join(' | ')}`);
			});
		});
	}

	it('a page the viewer may read is still there, and its edge is too', async () => {
		const mock = createPostgrestMock(truthWorld());
		await withBridge(config, mock.fetchImpl, async (base) => {
			const headers = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);
			const graph = await send(base, `/api/graph/pages?workspaceId=${IDS.team}`, headers);
			assert.equal(graph.status, 200, graph.text);
			const ids = graph.body.nodes.filter((node) => node.data?.kind === 'page').map((node) => node.pk).sort();
			assert.deepEqual(ids, [PAGES.dst, PAGES.probe, PAGES.src].sort());
			const links = graph.body.edges.filter((edge) => edge.type === 'link');
			assert.deepEqual(links.map((edge) => edge.id).sort(), [
				`link:${PAGES.probe}:${PAGES.dst}`,
				`link:${PAGES.probe}:${PAGES.src}`,
				`link:${PAGES.src}:${PAGES.dst}`,
			].sort());
		});
	});

	it('a private source takes its edge with it, and the readable edge stays', async () => {
		const world = truthWorld();
		world.osionos_pages[0].visibility = 'private'; // src
		const mock = createPostgrestMock(world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const headers = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);
			const graph = await send(base, `/api/graph/pages?workspaceId=${IDS.team}`, headers);
			const links = graph.body.edges.filter((edge) => edge.type === 'link').map((edge) => edge.id).sort();
			assert.deepEqual(links, [`link:${PAGES.probe}:${PAGES.dst}`]);
		});
	});

	it('a private page that links TO the probe is not one of its backlinks', async () => {
		const world = truthWorld();
		world.osionos_pages[0].visibility = 'private'; // src, owned by A
		world.osionos_page_links.push(
			{ source_page_id: PAGES.src, target_page_id: PAGES.probe, workspace_id: IDS.team },
			{ source_page_id: PAGES.dst, target_page_id: PAGES.probe, workspace_id: IDS.team },
		);
		const mock = createPostgrestMock(world);
		await withBridge(config, mock.fetchImpl, async (base) => {
			const headers = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);
			const backlinks = await send(base, `/api/pages/${PAGES.probe}/backlinks`, headers);
			assert.equal(backlinks.status, 200, backlinks.text);
			assert.ok(!JSON.stringify(backlinks.body).includes(PAGES.src), 'the private source is not a backlink');
			assert.ok(JSON.stringify(backlinks.body.linked).includes(PAGES.dst), 'the readable source is');
		});
	});
});

describe('unreadable is non-existent (C101)', () => {
	/**
	 * The world with a link to a page the viewer may not read, and to one that
	 * does not exist. The two worlds differ in the link and in nothing else.
	 */
	const worldWith = (target) => {
		const world = truthWorld();
		world.osionos_pages[1].visibility = 'private'; // dst: A's private page
		world.osionos_page_links = [{ source_page_id: PAGES.probe, target_page_id: target, workspace_id: IDS.team }];
		return world;
	};

	it('a link to a private page and a link to a random uuid answer the same, byte for byte', async () => {
		const privateMock = createPostgrestMock(worldWith(PAGES.dst));
		const randomMock = createPostgrestMock(worldWith('99999999-9999-4999-8999-999999999999'));
		await withBridge(config, privateMock.fetchImpl, async (base) => {
			const headers = sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]);
			for (const [surface, call] of SURFACES) {
				const hidden = await call(base, headers);
				await withBridge(config, randomMock.fetchImpl, async (other) => {
					const missing = await call(other, sessionHeaders(config, IDS.userB, IDS.homeB, [IDS.team]));
					assert.equal(missing.status, hidden.status, `${surface}: the same status`);
					assert.equal(missing.text, hidden.text, `${surface}: the same bytes`);
				});
			}
		});
	});
});
