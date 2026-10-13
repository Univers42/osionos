/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-cascade-chunks.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Large cascades are written in bounded chunks ordered so any landed prefix is
// a consistent tree: deletes and archives deepest first, restores root first.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, patch, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const ARCHIVED_AT = '2026-10-13T00:00:00.000Z';
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const ROOT = '99999999-9999-4999-8999-999999999999';
const chainId = (k) => `00000000-0000-4000-8000-${String(k).padStart(12, '0')}`;
const directId = (j) => `11111111-1111-4111-8111-${String(j).padStart(12, '0')}`;

// Owner A, root R in the team workspace; a chain of chainN under R plus directN
// direct children of R, all owned by A so the workspace gate accepts each one.
function buildWorld(chainN, directN, archivedAt = null) {
	const world = teamWorld();
	const pages = [{ ...teamPage(ROOT, IDS.userA, 'private', 'R', 'r text'), parent_page_id: null, archived_at: archivedAt }];
	const chain = [];
	for (let k = 1; k <= chainN; k += 1) {
		const id = chainId(k);
		chain.push(id);
		pages.push({ ...teamPage(id, IDS.userA, 'private', `c${k}`, 'c text'), parent_page_id: k === 1 ? ROOT : chainId(k - 1), archived_at: archivedAt });
	}
	const directs = [];
	for (let j = 1; j <= directN; j += 1) {
		const id = directId(j);
		directs.push(id);
		pages.push({ ...teamPage(id, IDS.userA, 'private', `d${j}`, 'd text'), parent_page_id: ROOT, archived_at: archivedAt });
	}
	world.osionos_pages.push(...pages);
	return { world, chain, directs };
}

// Recorded paths prove each request stays under proxy limits, which the call log alone cannot show.
function recording(mock, recorded) {
	return async (url, init = {}) => {
		recorded.push({ method: init.method ?? 'GET', path: new URL(String(url)).pathname + new URL(String(url)).search });
		return mock.fetchImpl(url, init);
	};
}

function deletesOf(mock) {
	return mock.calls.filter((call) => call.method === 'DELETE' && call.table === 'osionos_pages');
}

function deleteIds(call) {
	const raw = call.params.get('id') ?? '';
	if (raw.startsWith('in.(')) return raw.slice(4, -1).split(',').map(decodeURIComponent);
	return [raw.slice(3)];
}

describe('page cascade chunked writes', () => {
	it('a delete of 1000 descendants keeps every request at or under 3900 bytes and deletes deepest first', async () => {
		const { world, chain, directs } = buildWorld(250, 750);
		const mock = createPostgrestMock(world);
		const recorded = [];
		const response = await withBridge(config, recording(mock, recorded), (base) => send(base, `/api/pages/${ROOT}`, asA, { method: 'DELETE' }));
		assert.equal(response.status, 200, response.text);
		assert.equal(mock.page(ROOT), undefined);
		for (const id of chain) assert.equal(mock.page(id), undefined);
		for (const id of directs) assert.equal(mock.page(id), undefined);
		const deletes = deletesOf(mock);
		assert.equal(deletes.length, 11);
		for (const entry of recorded) assert.ok(entry.path.length <= 3900, `${entry.method} ${entry.path.length}`);
		const order = new Map();
		deletes.forEach((call, index) => { for (const id of deleteIds(call)) order.set(id, index); });
		assert.equal(order.get(ROOT), deletes.length - 1);
		assert.deepEqual(deleteIds(deletes[deletes.length - 1]), [ROOT]);
		for (const call of deletes.slice(0, -1)) assert.ok(!deleteIds(call).includes(ROOT));
		for (let k = 2; k <= 250; k += 1) assert.ok(order.get(chainId(k)) <= order.get(chainId(k - 1)), `c${k} after c${k - 1}`);
	});

	it('a delete that fails part way leaves no live page whose parent it deleted, and a retry finishes', async () => {
		const { world, chain, directs } = buildWorld(250, 750);
		let seen = 0;
		const mock = createPostgrestMock(world, { failWhen: (call) => {
			if (call.method !== 'DELETE' || call.table !== 'osionos_pages') return null;
			seen += 1;
			return seen === 3 ? { status: 500, body: { message: 'later' } } : null;
		} });
		const first = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${ROOT}`, asA, { method: 'DELETE' }));
		assert.ok(first.status >= 500, first.text);
		assert.notEqual(mock.page(ROOT), undefined);
		const live = new Set(mock.rows('osionos_pages').map((row) => row.id));
		const tree = new Set([ROOT, ...chain, ...directs]);
		for (const row of mock.rows('osionos_pages')) {
			if (tree.has(row.id)) assert.ok(row.parent_page_id === null || live.has(row.parent_page_id), row.id);
		}
		const retry = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${ROOT}`, asA, { method: 'DELETE' }));
		assert.equal(retry.status, 200, retry.text);
		assert.equal(mock.page(ROOT), undefined);
		for (const id of chain) assert.equal(mock.page(id), undefined);
		for (const id of directs) assert.equal(mock.page(id), undefined);
	});

	it('an archive that fails part way leaves the root active, and a retry archives all', async () => {
		const { world, chain, directs } = buildWorld(250, 750);
		let seen = 0;
		const mock = createPostgrestMock(world, { failWhen: (call) => {
			if (call.method !== 'PATCH' || call.table !== 'osionos_pages') return null;
			seen += 1;
			return seen === 3 ? { status: 500, body: { message: 'later' } } : null;
		} });
		const first = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${ROOT}`, asA, patch({ archivedAt: ARCHIVED_AT })));
		assert.ok(first.status >= 500, first.text);
		assert.equal(mock.page(ROOT).archived_at, null);
		const byId = new Map(mock.rows('osionos_pages').map((row) => [row.id, row]));
		for (const row of mock.rows('osionos_pages')) {
			if (row.archived_at === null && row.parent_page_id) assert.equal(byId.get(row.parent_page_id)?.archived_at ?? null, null);
		}
		const retry = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${ROOT}`, asA, patch({ archivedAt: ARCHIVED_AT })));
		assert.equal(retry.status, 200, retry.text);
		assert.equal(mock.page(ROOT).archived_at, ARCHIVED_AT);
		for (const id of chain) assert.equal(mock.page(id).archived_at, ARCHIVED_AT);
		for (const id of directs) assert.equal(mock.page(id).archived_at, ARCHIVED_AT);
		assert.equal(retry.body.cascadedIds.length, 1000);
	});

	it('a restore writes the root first and never leaves a restored page under an archived parent', async () => {
		const { world } = buildWorld(250, 750, ARCHIVED_AT);
		let seen = 0;
		const mock = createPostgrestMock(world, { failWhen: (call) => {
			if (call.method !== 'PATCH' || call.table !== 'osionos_pages') return null;
			seen += 1;
			return seen === 3 ? { status: 500, body: { message: 'later' } } : null;
		} });
		const first = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${ROOT}`, asA, patch({ archivedAt: null })));
		assert.ok(first.status >= 500, first.text);
		assert.equal(mock.page(ROOT).archived_at, null);
		const byId = new Map(mock.rows('osionos_pages').map((row) => [row.id, row]));
		for (const row of mock.rows('osionos_pages')) {
			if (row.archived_at === null && row.parent_page_id) assert.equal(byId.get(row.parent_page_id)?.archived_at ?? null, null);
		}
		const retry = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${ROOT}`, asA, patch({ archivedAt: null })));
		assert.equal(retry.status, 200, retry.text);
		for (const row of mock.rows('osionos_pages')) assert.equal(row.archived_at, null);
	});

	it('a descendant moved to another workspace before the write is not written', async () => {
		const { world } = buildWorld(250, 750);
		const mock = createPostgrestMock(world);
		const recorded = [];
		let moved = false;
		const gated = async (url, init = {}) => {
			if ((init.method ?? 'GET') === 'DELETE' && !moved) {
				moved = true;
				mock.page(chainId(250)).workspace_id = IDS.homeB;
			}
			recorded.push({ method: init.method ?? 'GET', path: new URL(String(url)).pathname + new URL(String(url)).search });
			return mock.fetchImpl(url, init);
		};
		const response = await withBridge(config, gated, (base) => send(base, `/api/pages/${ROOT}`, asA, { method: 'DELETE' }));
		assert.equal(response.status, 200, response.text);
		assert.notEqual(mock.page(chainId(250)), undefined);
	});

	it('200 descendants delete in three requests', async () => {
		const { world } = buildWorld(50, 150);
		const mock = createPostgrestMock(world);
		const response = await withBridge(config, mock.fetchImpl, (base) => send(base, `/api/pages/${ROOT}`, asA, { method: 'DELETE' }));
		assert.equal(response.status, 200, response.text);
		assert.equal(deletesOf(mock).length, 3);
	});
});
