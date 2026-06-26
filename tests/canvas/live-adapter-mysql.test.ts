/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-adapter-mysql.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* LiveMountAdapter — mysql engine (mysql-ops `tasks` mount). Same SQL filter
 * grammar as postgresql and — like every engine now — single-op cell writes
 * (the `/txn` batch was retired). Distinct schema: boolean `done`→checkbox,
 * FK project→relation, integer pk.
 * Drives the same composed pipeline the adapter calls (no leaf mocked away):
 * schema map → state build (loadState) → query translate (findPages) → pk
 * filter (getPage) → the LiveAdapterWrites delegate (persistState) over a
 * mocked fetch. */

import {
  MYSQL_ROWS,
  MYSQL_SCHEMA,
  mockFetch,
} from './live-adapter-fixtures.ts';
import assert from 'node:assert/strict';
import test from 'node:test';

import { mapLiveTable } from '../../src/shared/notion-database-sys/src/store/live/liveSchemaMapper.ts';
import { buildLiveState } from '../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts';
import { translateLivePageQuery } from '../../src/shared/notion-database-sys/src/store/live/liveQueryTranslator.ts';
import { livePkFilter } from '../../src/shared/notion-database-sys/src/store/live/liveWriteClient.ts';
import { LiveAdapterWrites } from '../../src/shared/notion-database-sys/src/store/live/liveAdapterWrites.ts';

const REF = { dbId: 'mysql-ops', table: 'tasks' };
const DB_ID = 'baas:mysql-ops:tasks';
const TASKS = MYSQL_SCHEMA.tables[0];
const tick = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms));

function newWrites(): { writes: LiveAdapterWrites; events: { type: string }[] } {
  const store = new Map<string, string>();
  const events: { type: string }[] = [];
  const writes = new LiveAdapterWrites(DB_ID, {
    getSchema: async () => MYSQL_SCHEMA,
    emit: (event) => events.push(event),
    storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } },
  });
  return { writes, events };
}

test('mysql schema introspection: text title, boolean→checkbox, FK→relation, enum→select', () => {
  const { properties, titlePropertyId } = mapLiveTable(TASKS, REF.dbId);
  assert.equal(titlePropertyId, 'title'); // first text-ish title column wins
  assert.equal(properties.title.type, 'title');
  assert.equal(properties.done.type, 'checkbox');
  assert.equal(properties.priority.type, 'select');
  assert.equal(properties.project_id.type, 'relation');
  assert.equal(properties.project_id.relationConfig?.databaseId, 'baas:mysql-ops:projects');
});

test('mysql loadState builds pages keyed by integer pk; boolean decodes to bool', () => {
  const state = buildLiveState(MYSQL_SCHEMA, REF, { tasks: MYSQL_ROWS });
  assert.deepEqual(Object.keys(state.pages).sort(), [
    'baas:mysql-ops:tasks:7',
    'baas:mysql-ops:tasks:8',
  ]);
  assert.equal(state.pages['baas:mysql-ops:tasks:7'].properties.done, false);
  assert.equal(state.pages['baas:mysql-ops:tasks:8'].properties.done, true);
  assert.equal(state.pages['baas:mysql-ops:tasks:7'].properties.title, 'Wire the gate');
});

test('mysql findPages → sql grammar (in→$in, contains→$ilike) + capped limit', () => {
  const { params } = translateLivePageQuery({
    databaseId: DB_ID,
    filter: { priority: { in: ['low', 'high'] }, title: { contains: 'Seed' } },
    sort: [{ propertyId: 'id', direction: 'asc' }],
    limit: 9000,
  }, MYSQL_SCHEMA.engine);
  assert.deepEqual(params.filter, { $and: [{ priority: { $in: ['low', 'high'] } }, { title: { $ilike: '%Seed%' } }] });
  assert.deepEqual(params.sort, { id: 'asc' });
  assert.equal(params.limit, 500); // LIVE_MAX_LIMIT cap
});

test('mysql getPage builds a numeric pk filter (integer column coercion)', () => {
  assert.deepEqual(livePkFilter(TASKS, '7'), { id: 7 });
});

test('mysql persistState cell edits each drain as a single-op update (no /txn batch)', async () => {
  const { writes } = newWrites();
  const prev = buildLiveState(MYSQL_SCHEMA, REF, { tasks: MYSQL_ROWS });
  writes.noteLoadedPages(prev.pages);
  const next = structuredClone(prev);
  next.pages['baas:mysql-ops:tasks:7'].properties.done = true;
  next.pages['baas:mysql-ops:tasks:8'].properties.priority = 'high';
  const ok = { status: 200, body: { rows: [], affected_rows: 1 } };
  const sent = mockFetch([ok, ok]);
  writes.persist(next, prev);
  await tick();
  assert.equal(sent.length, 2); // one single-op update per edited row (the /txn batch is gone)
  for (const request of sent) {
    assert.match(request.url, /\/api\/databases\/mysql-ops\/tables\/tasks$/);
    assert.equal(request.body.op, 'update');
    assert.equal(request.body.resource, undefined); // the /txn-only field is stripped for single-op
  }
  const dataByPk = Object.fromEntries(sent.map((request) => [JSON.stringify(request.body.filter), request.body.data]));
  assert.deepEqual(dataByPk['{"id":7}'], { done: true });
  assert.deepEqual(dataByPk['{"id":8}'], { priority: 'high' });
  writes.stop();
});

test('mysql persistState delete drains as op=delete with the typed pk filter', async () => {
  const { writes } = newWrites();
  const prev = buildLiveState(MYSQL_SCHEMA, REF, { tasks: MYSQL_ROWS });
  writes.noteLoadedPages(prev.pages);
  const next = structuredClone(prev);
  delete next.pages['baas:mysql-ops:tasks:8']; // user removed a row
  const sent = mockFetch([{ status: 200, body: { rows: [], affected_rows: 1 } }]);
  writes.persist(next, prev);
  await tick();
  assert.match(sent[0].url, /\/api\/databases\/mysql-ops\/tables\/tasks$/);
  assert.equal(sent[0].body.op, 'delete');
  assert.deepEqual(sent[0].body.filter, { id: 8 });
  writes.stop();
});

test('mysql 5xx keeps the entry pending for retry (never hammers a struggling server)', async () => {
  const { writes } = newWrites();
  const prev = buildLiveState(MYSQL_SCHEMA, REF, { tasks: MYSQL_ROWS });
  writes.noteLoadedPages(prev.pages);
  const next = structuredClone(prev);
  next.pages['baas:mysql-ops:tasks:7'].properties.title = 'Retry me';
  const sent = mockFetch([{ status: 503, body: { message: 'overloaded' } }]);
  writes.persist(next, prev);
  await tick();
  assert.equal(sent.length, 1);
  assert.equal(writes.pendingWrites(), 1); // entry survives the transient failure
  writes.stop();
});
