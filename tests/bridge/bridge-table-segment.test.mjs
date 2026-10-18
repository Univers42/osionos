/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-table-segment.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// G6 F3: the `table` URL segment is spliced into the query-router path, while the mount
// ACL only checked the dbId. A segment that is not a plain identifier never leaves the bridge.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queryRouterTablePath } from '../../scripts/bridge-api.mjs';
import { IDS, createPostgrestMock, harnessConfig, post, send, sessionHeaders, teamWorld, withBridge } from './support/bridge-harness.mjs';

const config = harnessConfig();
const asA = sessionHeaders(config, IDS.userA, IDS.homeA);
const DB = 'f0f0f0f0-6666-4666-8666-f0f0f0f0f0f0';
// The live names plus the Mongo-style shapes a stricter identifier rule would have broken.
const LIVE_NAMES = ['og_notes', 'og_edges', 'og_overlays', 'devices', 'events', 'notes', 'orders', 'tasks', 'users', 'og-notes', 'a.b'];
const ROUTES = {
	'record read': (base, table) => send(base, `/api/records/${DB}/${table}/7`, asA),
	'database rows': (base, table) => send(base, `/api/databases/${DB}/tables/${table}`, asA, post({ op: 'list', filter: { id: 7 } })),
};

function world(table = 'users') {
	const seed = teamWorld();
	seed.osionos_workspace_databases = [{ workspace_id: IDS.team, db_id: DB, engine: 'postgresql', tables: [table], edges_table: null, label: 'Users' }];
	const mock = createPostgrestMock(seed, { records: { [`${DB}/${table}`]: [{ id: 7, name: 'row' }] } });
	const routed = [];
	const fetchImpl = (url, init) => {
		if (String(url).startsWith('http://query-router.local')) routed.push(new URL(String(url)).pathname);
		return mock.fetchImpl(url, init);
	};
	return { fetchImpl, routed };
}

describe('the table segment is a plain identifier or a 422', () => {
	for (const [name, route] of Object.entries(ROUTES)) {
		for (const table of ['a%2F..%2Fx', 'a%2Fb', 'a%5Cb', 'a%3Fb', '.hidden', '-lead']) {
			it(`${name}: ${table} -> 422, nothing reaches the query-router`, async () => {
				const { fetchImpl, routed } = world();
				await withBridge(config, fetchImpl, async (base) => {
					const answer = await route(base, table);
					assert.equal(answer.status, 422, answer.text);
					assert.deepEqual(routed, []);
				});
			});
		}

		for (const table of LIVE_NAMES) {
			it(`${name}: ${table} -> passed through on /tables/${table}`, async () => {
				const { fetchImpl, routed } = world(table);
				await withBridge(config, fetchImpl, async (base) => {
					const answer = await route(base, table);
					assert.equal(answer.status, 200, answer.text);
					assert.deepEqual(routed, [`/${DB}/tables/${table}`]);
				});
			});
		}
	}
});

// A client normalises `.` and `..` out of the URL before they reach the route, so the
// dot-segments are checked on the path builder itself.
describe('queryRouterTablePath', () => {
	for (const table of ['.', '..', '.hidden', 'a/b', 'a\\b', '', 'x'.repeat(121)]) {
		it(`refuses ${JSON.stringify(table)}`, () => {
			assert.throws(() => queryRouterTablePath(DB, table), { status: 422 });
		});
	}

	it('encodes what it accepts', () => {
		assert.equal(queryRouterTablePath(DB, 'og-notes'), `/${DB}/tables/og-notes`);
	});
});
