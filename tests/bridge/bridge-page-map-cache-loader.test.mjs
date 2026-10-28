/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-map-cache-loader.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The parent-map cache behind the real page-access loader (parent-map-cache verdict
// C700-C710). Two instances of bridge-api.mjs run side by side over one fake PostgREST:
// `warm` was loaded with PAGE_MAP_CACHE=1, `cold` without. Both share one
// bridge-access-generation.mjs, so a bump reaches the warm cache exactly as a bridge
// writer's would. Every level the warm loader answers is compared with the cold one.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpAccess } from '../../scripts/bridge-access-generation.mjs';
import { createPostgrestMock, harnessConfig } from './support/bridge-harness.mjs';
import { scanAccessWriters } from './support/access-writers-scan.mjs';

process.env.PAGE_MAP_CACHE = '1';
delete process.env.PAGE_MAP_CACHE_TTL_MS;
const warm = await import('../../scripts/bridge-api.mjs?page-map=warm');
delete process.env.PAGE_MAP_CACHE;
const cold = await import('../../scripts/bridge-api.mjs?page-map=cold');

const WS = '5a5a5a5a-0000-4000-8000-000000000001';
const OWNER = '6b6b6b6b-0000-4000-8000-000000000001';
const OTHER = '6b6b6b6b-0000-4000-8000-000000000002';
const VIEWER = '6b6b6b6b-0000-4000-8000-000000000003';
const GUEST = '6b6b6b6b-0000-4000-8000-000000000004';
const USERS = [OWNER, OTHER, VIEWER, GUEST];
const PERMISSIONS = ['no_access', 'can_view', 'can_comment', 'can_edit', 'full_access'];
const ROOT = pageId(1);
const CHILD = pageId(2);
const GRAND = pageId(3);
const SCRIPTS = fileURLToPath(new URL('../../scripts', import.meta.url));

function pageId(n) {
	return `7c7c7c7c-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const page = (n, ownerId, visibility, parent = null) => ({ id: pageId(n), workspace_id: WS, owner_id: ownerId, visibility, parent_page_id: parent, collaborators: [] });
const rule = (resourceId, permission, userId = GUEST) => ({
	id: `r-${Math.random()}`, workspace_id: WS, resource_type: 'page', resource_id: resourceId, target: { type: 'user', userId }, permission, explicit: true, created_at: '2026-10-28T00:00:00Z',
});

/** A fresh world; the bump stands for the writes that built it, so no earlier test's map is served. */
function world(pages, rules) {
	const mock = createPostgrestMock({
		osionos_workspace_members: [
			{ workspace_id: WS, user_id: OWNER, role: 'owner', permissions: ['create', 'read', 'update', 'delete', 'admin'] },
			{ workspace_id: WS, user_id: OTHER, role: 'editor', permissions: ['create', 'read', 'update'] },
			{ workspace_id: WS, user_id: VIEWER, role: 'viewer', permissions: ['read'] },
			{ workspace_id: WS, user_id: GUEST, role: 'guest', permissions: ['read'] },
		],
		osionos_pages: pages,
		osionos_share_rules: rules,
	});
	bumpAccess({ workspaceId: WS });
	const config = harnessConfig();
	const pageReads = () => mock.calls.filter((call) => call.method === 'GET' && call.table === 'osionos_pages').length;
	const entry = (api, userId) => api.createPageAccessLoader({ userId }, config, mock.fetchImpl).entryFor(WS);
	async function levels(api, userId) {
		const loaded = await entry(api, userId);
		return mock.rows('osionos_pages').map((row) => `${row.id}:${api.pageLevelFor(loaded, row, userId)}`);
	}
	async function assertSame(label) {
		for (const userId of USERS) assert.deepEqual(await levels(warm, userId), await levels(cold, userId), `${label} as ${userId}`);
	}
	return { mock, config, pageReads, entry, levels, assertSame, pages: () => mock.rows('osionos_pages'), rules: () => mock.rows('osionos_share_rules') };
}

const tree = () => [page(1, OWNER, 'private'), page(2, OWNER, 'private', ROOT), page(3, OWNER, 'private', CHILD)];
const levelOf = async (w, api, userId, id) => (await w.levels(api, userId)).find((entry) => entry.startsWith(id)).split(':')[1];

describe('page map cache behind the page-access loader', () => {
	it('C700: with the flag off, every request reads the map', async () => {
		const w = world(tree(), [rule(ROOT, 'can_view')]);
		await w.entry(cold, GUEST);
		await w.entry(cold, GUEST);
		assert.equal(w.pageReads(), 2);
	});

	it('C703: every page writer bumps a scope that reaches the workspace map', () => {
		const writers = readdirSync(SCRIPTS).filter((name) => /^bridge-.*\.mjs$/.test(name) && name !== 'bridge-access-generation.mjs')
			.flatMap((name) => scanAccessWriters(`scripts/${name}`, readFileSync(join(SCRIPTS, name), 'utf8')).writers.map((writer) => ({ name, ...writer })))
			.filter((writer) => writer.bumped && /osionos_pages\b/.test(writer.text));
		assert.ok(writers.length >= 10, `found ${writers.length} bumped page writers`);
		const narrow = writers.filter((writer) => writer.scope !== '' && !/workspace|accessScope/i.test(writer.scope));
		assert.deepEqual(narrow.map((writer) => `${writer.name}:${writer.line} ${writer.scope}`), []);
	});

	it('C703: each writer scope makes the next request re-read; a user-only bump does not', async () => {
		const w = world(tree(), [rule(ROOT, 'can_view')]);
		const scopes = [{ workspaceId: WS }, { workspaceId: [pageId(98), WS] }, { workspaceId: WS.toUpperCase() }, undefined];
		await w.entry(warm, GUEST);
		for (const scope of scopes) {
			const before = w.pageReads();
			bumpAccess(scope);
			await w.entry(warm, GUEST);
			assert.equal(w.pageReads(), before + 1, JSON.stringify(scope));
		}
		const before = w.pageReads();
		bumpAccess({ userId: GUEST });
		await w.entry(warm, GUEST);
		assert.equal(w.pageReads(), before);
	});

	it('C704: X1 R1-R4 answer the same warm and cold', async () => {
		const shapes = [
			['R1 workspace-wide grant', tree(), [rule(null, 'full_access')]],
			['R2 rule on the private page', tree(), [rule(CHILD, 'can_edit')]],
			['R3/R4 grant on a foreign ancestor', [page(1, OTHER, 'private'), ...tree().slice(1)], [rule(ROOT, 'can_edit')]],
			['shared child under a foreign grant', [page(1, OTHER, 'private'), page(2, OWNER, 'shared', ROOT), page(3, OWNER, 'private', CHILD)], [rule(ROOT, 'can_edit')]],
		];
		for (const [label, pages, rules] of shapes) {
			const w = world(pages, rules);
			await w.assertSame(`${label} cold fill`);
			await w.assertSame(`${label} warm hit`);
		}
	});

	it('C704: a move is served stale only until its bump; a private page then reads none to the guest', async () => {
		const w = world([page(1, OWNER, 'shared'), page(2, OTHER, 'shared')], [rule(ROOT, 'can_edit')]);
		const before = await levelOf(w, warm, GUEST, CHILD);
		w.pages().find((row) => row.id === CHILD).parent_page_id = ROOT;
		const reads = w.pageReads();
		assert.equal(await levelOf(w, warm, GUEST, CHILD), before, 'unbumped: the warm map is really served');
		assert.equal(w.pageReads(), reads);
		assert.equal(await levelOf(w, cold, GUEST, CHILD), 'can_edit');
		assert.notEqual(before, 'can_edit');
		bumpAccess({ workspaceId: WS });
		assert.equal(await levelOf(w, warm, GUEST, CHILD), 'can_edit');
		w.pages().find((row) => row.id === CHILD).visibility = 'private';
		bumpAccess({ workspaceId: WS });
		assert.equal(await levelOf(w, warm, GUEST, CHILD), 'none');
		await w.assertSame('after the flip');
	});

	it('C704: warm equals cold after every random move, flip, owner change, create and delete', async () => {
		let seed = 0x5eed;
		const random = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		const pick = (list) => list[Math.floor(random() * list.length)];
		const pickPage = (w) => pick(w.pages());
		let made = 1000;
		const mutations = [
			(w) => { pickPage(w).parent_page_id = random() < 0.2 ? null : pickPage(w).id; },
			(w) => { const row = pickPage(w); row.visibility = row.visibility === 'private' ? 'shared' : 'private'; },
			(w) => { pickPage(w).owner_id = pick(USERS); },
			(w) => { w.pages().push(page(made += 1, pick(USERS), pick(['private', 'shared']), pickPage(w).id)); },
			(w) => {
				const gone = pickPage(w).id;
				w.pages().splice(w.pages().findIndex((row) => row.id === gone), 1);
				for (const row of w.pages()) if (row.parent_page_id === gone) row.parent_page_id = null;
			},
		];
		let hits = 0;
		for (let run = 0; run < 200; run += 1) {
			const size = 3 + Math.floor(random() * 30);
			const pages = Array.from({ length: size }, (_, n) => page(n + 1, pick(USERS), pick(['private', 'shared']), n > 0 && random() < 0.8 ? pageId(1 + Math.floor(random() * n)) : null));
			const rules = Array.from({ length: 1 + Math.floor(random() * 4) }, () => rule(random() < 0.2 ? null : pick(pages).id, pick(PERMISSIONS), pick([GUEST, VIEWER])));
			const w = world(pages, rules);
			await w.assertSame(`run ${run} start`);
			for (let step = 0; step < 3; step += 1) {
				if (w.pages().length > 1) pick(mutations)(w);
				bumpAccess({ workspaceId: WS });
				await w.assertSame(`run ${run} step ${step}`);
				const reads = w.pageReads();
				// Cold reads once per user; every warm request beyond that is a miss.
				await w.assertSame(`run ${run} step ${step} hit`);
				hits += 2 * USERS.length - (w.pageReads() - reads);
			}
		}
		assert.ok(hits >= 200 * 3 * USERS.length, `warm requests that skipped the read: ${hits}`);
	});

	it('C706: membership and rules are read per request while the map is warm', async () => {
		const w = world(tree(), [rule(CHILD, 'can_edit')]);
		assert.equal(await levelOf(w, warm, GUEST, CHILD), 'can_edit');
		const reads = w.pageReads();
		w.rules().splice(0, 1, rule(CHILD, 'can_view'));
		assert.equal(await levelOf(w, warm, GUEST, CHILD), 'can_view');
		w.mock.rows('osionos_workspace_members').splice(3, 1);
		assert.equal(await levelOf(w, warm, GUEST, CHILD), 'none');
		assert.equal(w.pageReads(), reads, 'the map stayed warm');
	});

	it('C707: the shared map refuses writes and a second request is unaffected', async () => {
		const w = world(tree(), [rule(ROOT, 'can_comment')]);
		const entry = await w.entry(warm, GUEST);
		for (const map of [entry.parentOf, entry.pageMeta]) {
			assert.throws(() => map.set(GRAND, null), TypeError);
			assert.throws(() => map.delete(GRAND), TypeError);
			assert.throws(() => map.clear(), TypeError);
		}
		assert.throws(() => { entry.pageMeta.get(GRAND).visibility = 'shared'; }, TypeError);
		assert.ok(entry.parentOf instanceof Map);
		assert.equal((await w.entry(warm, GUEST)).parentOf, entry.parentOf, 'served from the cache');
		await w.assertSame('after the mutation attempts');
	});

	it('C708: a map read without meta never answers a request that needs it', async () => {
		const w = world(tree(), [rule(ROOT, 'no_access')]);
		assert.equal((await w.entry(warm, GUEST)).pageMeta, null);
		w.rules().push(rule(CHILD, 'can_view'));
		const reads = w.pageReads();
		assert.ok((await w.entry(warm, GUEST)).pageMeta instanceof Map);
		assert.equal(w.pageReads(), reads + 1);
	});

	it('C709: a failed, malformed or oversized read stores nothing and serves nothing', async () => {
		const w = world(tree(), [rule(ROOT, 'can_view')]);
		const answers = [{ status: 500, body: { message: 'down' } }, { status: 200, body: { not: 'rows' } }, { status: 200, body: Array.from({ length: 20_001 }, (_, n) => ({ id: pageId(n + 10) })) }];
		const failing = createPostgrestMock({ osionos_workspace_members: w.mock.rows('osionos_workspace_members'), osionos_pages: tree(), osionos_share_rules: w.rules() }, {
			failWhen: (call) => (call.method === 'GET' && call.table === 'osionos_pages' ? answers.shift() ?? null : null),
		});
		for (let attempt = 0; attempt < 3; attempt += 1) {
			await assert.rejects(warm.createPageAccessLoader({ userId: GUEST }, w.config, failing.fetchImpl).entryFor(WS), { status: 503 });
		}
		assert.ok((await warm.createPageAccessLoader({ userId: GUEST }, w.config, failing.fetchImpl).entryFor(WS)).parentOf.has(CHILD));
	});

});
