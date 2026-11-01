/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-favorites-fail-closed.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #59: the favorites read fails closed on a BaaS failure (the chunk's pages stay absent),
// but a programming error in that read (the release's `idsFilter` ReferenceError) must
// surface as a 500 instead of an empty list that looks like "no favorites".

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, createPostgrestMock, harnessConfig, send, sessionHeaders, teamPage, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA, [IDS.team]);
const STARRED = 'b3000000-0000-4000-8000-000000000001';

function world() {
	const base = teamWorld({ memberRole: 'editor' });
	base.osionos_pages = [teamPage(STARRED, IDS.userA, 'shared', 'Starred', 'body')];
	base.osionos_page_favorites = [{ user_id: IDS.userA, page_id: STARRED, created_at: '2026-10-02T00:00:00.000Z' }];
	return base;
}

/** The mock, except the favorites' page-row chunk read answers with `fail()`. */
function chunkReadFails(fail) {
	const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
	return async (url, init) => (/\/rest\/v1\/osionos_pages\?id=in\./.test(String(url)) ? fail() : mock.fetchImpl(url, init));
}

describe('GET /api/favorites chunk read', () => {
	it('lists the starred page when the read succeeds', async () => {
		const mock = createPostgrestMock(world(), { realWorkspaceRpc: true });
		await withBridge(config, mock.fetchImpl, async (base) => {
			const r = await send(base, '/api/favorites', asA);
			assert.equal(r.status, 200, r.text);
			assert.deepEqual(r.body.pageIds, [STARRED]);
		});
	});

	it('fails closed on a BaaS 503 or a refused connection: 200, page absent', async () => {
		const failures = [
			() => new Response('{"message":"down"}', { status: 503, headers: { 'Content-Type': 'application/json' } }),
			() => { throw new TypeError('fetch failed'); },
		];
		for (const fail of failures) {
			await withBridge(config, chunkReadFails(fail), async (base) => {
				const r = await send(base, '/api/favorites', asA);
				assert.equal(r.status, 200, r.text);
				assert.deepEqual(r.body.pageIds, []);
			});
		}
	});

	it('surfaces a programming error as a 500, never as an empty list', async () => {
		const fail = () => { throw new ReferenceError('idsFilter is not defined'); };
		await withBridge(config, chunkReadFails(fail), async (base) => {
			const r = await send(base, '/api/favorites', asA);
			assert.equal(r.status, 500, r.text);
		});
	});
});
