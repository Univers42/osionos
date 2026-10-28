/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-map-cache.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The parent-map cache on its own (parent-map-cache verdict C700-C710): flag and TTL, the
// workspace ticket, single-flight across a bump, the key, expiry and the bounds. The same
// cache behind the real page-access loader is bridge-page-map-cache-loader.test.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accessTicketWorkspace, bumpAccess, ticketIsCurrent } from '../../scripts/bridge-access-generation.mjs';
import { createPageMapCache, pageMapCacheTtlMs } from '../../scripts/bridge-page-map-cache.mjs';

const WS = '5a5a5a5a-0000-4000-8000-000000000001';
const GUEST = '6b6b6b6b-0000-4000-8000-000000000004';
const SCRIPTS = fileURLToPath(new URL('../../scripts', import.meta.url));
const pageId = (n) => `7c7c7c7c-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fakeMap = (pages) => ({ parentOf: new Map(Array.from({ length: pages }, (_, n) => [`p${n}`, null])), pageMeta: null });

function deferred() {
	let resolve;
	const promise = new Promise((done) => { resolve = done; });
	return { promise, resolve };
}

describe('page map cache', () => {
	it('C700: off unless PAGE_MAP_CACHE=1, TTL clamped, and off hands back the read untouched', async () => {
		assert.equal(pageMapCacheTtlMs({}), 0);
		assert.equal(pageMapCacheTtlMs({ PAGE_MAP_CACHE: 'true' }), 0);
		assert.equal(pageMapCacheTtlMs({ PAGE_MAP_CACHE: '1' }), 2000);
		assert.equal(pageMapCacheTtlMs({ PAGE_MAP_CACHE: '1', PAGE_MAP_CACHE_TTL_MS: 'soon' }), 0);
		assert.equal(pageMapCacheTtlMs({ PAGE_MAP_CACHE: '1', PAGE_MAP_CACHE_TTL_MS: '0' }), 0);
		assert.equal(pageMapCacheTtlMs({ PAGE_MAP_CACHE: '1', PAGE_MAP_CACHE_TTL_MS: '-9' }), 0);
		const result = fakeMap(1);
		const off = createPageMapCache({ env: {} });
		assert.equal(await off.get({ baasUrl: 'b', workspaceId: WS, withMeta: false }, async () => result), result);
		assert.equal(Object.isFrozen(result), false, 'off must not copy or freeze');
	});

	it('C701: the workspace ticket dies on a workspace, unscoped or overflow bump, never on a user bump', () => {
		let ticket = accessTicketWorkspace(WS);
		bumpAccess({ userId: GUEST });
		bumpAccess({ workspaceId: pageId(99) });
		assert.ok(ticketIsCurrent(ticket));
		bumpAccess({ workspaceId: WS.toUpperCase() });
		assert.ok(!ticketIsCurrent(ticket));
		ticket = accessTicketWorkspace(WS);
		bumpAccess();
		assert.ok(!ticketIsCurrent(ticket));
		ticket = accessTicketWorkspace(WS);
		for (let n = 0; n <= 10_000; n += 1) bumpAccess({ workspaceId: `overflow-${n}` });
		assert.ok(!ticketIsCurrent(ticket));
		const sources = readdirSync(SCRIPTS).filter((name) => name.endsWith('.mjs')).map((name) => readFileSync(join(SCRIPTS, name), 'utf8'));
		assert.ok(sources.every((source) => !/accessTicket\(\s*\{/.test(source)), 'accessTicket takes (userId, workspaceId), never an object');
	});

	it('C702: a bump during the read stores nothing, and a later miss never joins the pre-bump read', async () => {
		const cache = createPageMapCache({ env: { PAGE_MAP_CACHE: '1' } });
		const key = { baasUrl: 'b', workspaceId: WS, withMeta: false };
		const gate = deferred();
		let loads = 0;
		const load = async () => { loads += 1; await gate.promise; return fakeMap(1); };
		const first = cache.get(key, load);
		const joined = cache.get(key, load);
		bumpAccess({ workspaceId: WS });
		const afterBump = cache.get(key, async () => { loads += 1; return fakeMap(2); });
		const fresh = await Promise.race([afterBump, new Promise((stuck) => setImmediate(stuck, null))]);
		assert.equal(fresh?.parentOf.size, 2, 'a miss after the bump never joins the pre-bump read');
		gate.resolve();
		assert.equal(await first, await joined, 'a miss before the bump shares the read');
		assert.equal((await cache.get(key, load)).parentOf.size, 2, 'the pre-bump read, landing last, never replaces the fresh entry');
		assert.equal(loads, 2);
	});

	it('C705: an out-of-process write is bounded by a TTL of at most 5 s, and the header says so', () => {
		assert.equal(pageMapCacheTtlMs({ PAGE_MAP_CACHE: '1', PAGE_MAP_CACHE_TTL_MS: '60000' }), 5000);
		const source = readFileSync(join(SCRIPTS, 'bridge-page-map-cache.mjs'), 'utf8');
		const header = source.slice(source.indexOf('/**'), source.indexOf('*/', source.indexOf('/**')));
		assert.match(header, /Caveat: .*\n(?:.*\n)*.*Out of process, the TTL \(at most 5 s/);
		assert.match(header, /bridge-account-erasure\.mjs:186/);
	});

	it('C708: the key is the PostgREST URL and the case-blind workspace id', async () => {
		const cache = createPageMapCache({ env: { PAGE_MAP_CACHE: '1' } });
		let loads = 0;
		const load = async () => { loads += 1; return fakeMap(1); };
		await cache.get({ baasUrl: 'a', workspaceId: WS, withMeta: false }, load);
		await cache.get({ baasUrl: 'a', workspaceId: WS.toUpperCase(), withMeta: false }, load);
		await cache.get({ baasUrl: 'b', workspaceId: WS, withMeta: false }, load);
		assert.equal(loads, 2);
	});

	it('C709: an entry past its TTL re-reads', async () => {
		let clock = 0;
		const cache = createPageMapCache({ env: { PAGE_MAP_CACHE: '1', PAGE_MAP_CACHE_TTL_MS: '100' }, now: () => clock });
		let loads = 0;
		const load = async () => { loads += 1; return fakeMap(1); };
		const key = { baasUrl: 'b', workspaceId: WS, withMeta: false };
		await cache.get(key, load);
		clock = 99;
		await cache.get(key, load);
		clock = 100;
		await cache.get(key, load);
		assert.equal(loads, 2);
	});

	it('C710: bounded by entry count and total pages, oldest first; an oversized map is served, not kept', async () => {
		const cache = createPageMapCache({ env: { PAGE_MAP_CACHE: '1' }, maxEntries: 2, maxTotalPages: 10 });
		const at = (n, pages) => cache.get({ baasUrl: 'b', workspaceId: pageId(n), withMeta: false }, async () => fakeMap(pages));
		await at(1, 1);
		await at(2, 1);
		await at(3, 1);
		assert.deepEqual(cache.stats(), { entries: 2, pages: 2, pending: 0 });
		await at(4, 9);
		assert.deepEqual(cache.stats(), { entries: 2, pages: 10, pending: 0 });
		assert.equal((await at(5, 11)).parentOf.size, 11);
		assert.deepEqual(cache.stats(), { entries: 0, pages: 0, pending: 0 });
	});
});
