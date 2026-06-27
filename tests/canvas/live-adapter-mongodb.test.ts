/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-adapter-mongodb.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* LiveMountAdapter — mongodb engine (mongo-activity `events` mount). The engine
 * where the wire FORKS hardest: string `_id` pk (no numeric coercion), the
 * native mongo filter grammar (contains→$regex+$options, NOT $ilike), and
 * `transactions: false` so the write delegate drains cells as SEQUENTIAL single
 * op=update calls instead of one atomic /txn batch. Same composed pipeline the
 * adapter calls is driven directly (schema map → loadState → findPages →
 * getPage → LiveAdapterWrites persist) over a mocked fetch. */

import {
  MONGO_ROWS,
  MONGO_SCHEMA,
  mockFetch,
} from './live-adapter-fixtures.ts';
import assert from 'node:assert/strict';
import test from 'node:test';

import { mapLiveTable } from '../../src/shared/notion-database-sys/src/store/live/liveSchemaMapper.ts';
import {
  buildLivePage,
  buildLiveState,
} from '../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts';
import { translateLivePageQuery } from '../../src/shared/notion-database-sys/src/store/live/liveQueryTranslator.ts';
import { livePkFilter } from '../../src/shared/notion-database-sys/src/store/live/liveWriteClient.ts';
import { LiveAdapterWrites } from '../../src/shared/notion-database-sys/src/store/live/liveAdapterWrites.ts';

const REF = { dbId: 'mongo-activity', table: 'events' };
const DB_ID = 'baas:mongo-activity:events';
const EVENTS = MONGO_SCHEMA.tables[0];
const tick = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms));

function newWrites(): { writes: LiveAdapterWrites; events: { type: string }[] } {
  const store = new Map<string, string>();
  const events: { type: string }[] = [];
  const writes = new LiveAdapterWrites(DB_ID, {
    getSchema: async () => MONGO_SCHEMA,
    emit: (event) => events.push(event),
    storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } },
  });
  return { writes, events };
}

test('mongo schema introspection: objectid _id → read-only id type, text title pick', () => {
  const { properties, titlePropertyId } = mapLiveTable(EVENTS, REF.dbId);
  assert.equal(EVENTS.primary_key[0], '_id');
  assert.equal(properties._id.type, 'id'); // objectid → read-only rendered id
  assert.equal(titlePropertyId, 'name'); // first named/text column
  assert.equal(properties.name.type, 'title');
  assert.equal(properties.count.type, 'number');
});

test('mongo loadState keys pages by the string _id (via the _id/id wire alias)', () => {
  const state = buildLiveState(MONGO_SCHEMA, REF, { events: MONGO_ROWS });
  assert.deepEqual(Object.keys(state.pages).sort(), [
    'baas:mongo-activity:events:evt-000001',
    'baas:mongo-activity:events:evt-000002',
  ]);
  const page = state.pages['baas:mongo-activity:events:evt-000001'];
  assert.equal(page.properties.name, 'login');
  assert.equal(page.properties.count, 3);
});

test('mongo findPages → NATIVE grammar: contains→$regex+$options (never $ilike)', () => {
  const { params, clientSide } = translateLivePageQuery({
    databaseId: DB_ID,
    filter: { kind: { eq: 'auth' }, name: { contains: 'log' } },
    limit: 25,
  }, MONGO_SCHEMA.engine);
  assert.deepEqual(params.filter, { $and: [{ kind: { $eq: 'auth' } }, { name: { $regex: 'log', $options: 'i' } }] });
  assert.equal(params.limit, 25);
  assert.equal(clientSide.length, 0);
});

test('mongo getPage keeps the pk a STRING (no numeric coercion on _id)', () => {
  const filter = livePkFilter(EVENTS, 'evt-000001');
  assert.deepEqual(filter, { _id: 'evt-000001' }); // stays a string, unlike pg/mysql integer pks
  const page = buildLivePage(MONGO_ROWS[0], EVENTS, buildLiveState(MONGO_SCHEMA, REF, { events: [MONGO_ROWS[0]] }).databases[DB_ID], REF);
  assert.equal(page.id, 'baas:mongo-activity:events:evt-000001');
});

test('mongo persistState cells drain SEQUENTIALLY as single op=update calls (no /txn)', async () => {
  const { writes } = newWrites();
  const prev = buildLiveState(MONGO_SCHEMA, REF, { events: MONGO_ROWS });
  writes.noteLoadedPages(prev.pages);
  const next = structuredClone(prev);
  next.pages['baas:mongo-activity:events:evt-000001'].properties.count = 4;
  next.pages['baas:mongo-activity:events:evt-000002'].properties.kind = 'nav';
  const sent = mockFetch([
    { status: 200, body: { rows: [], affected_rows: 1 } },
    { status: 200, body: { rows: [], affected_rows: 1 } },
  ]);
  writes.persist(next, prev);
  await tick();
  assert.equal(sent.length, 2); // two single calls, never a batched /txn
  assert.ok(sent.every((request) => /\/api\/databases\/mongo-activity\/tables\/events$/.test(request.url)));
  assert.ok(sent.every((request) => request.body.op === 'update'));
  const filters = sent.map((request) => request.body.filter);
  assert.ok(filters.some((filter) => JSON.stringify(filter) === JSON.stringify({ _id: 'evt-000001' })));
  writes.stop();
});

test('mongo cell update on a vanished row (affected 0) reconciles to a deletion', async () => {
  const { writes, events } = newWrites();
  const prev = buildLiveState(MONGO_SCHEMA, REF, { events: MONGO_ROWS });
  writes.noteLoadedPages(prev.pages);
  const next = structuredClone(prev);
  next.pages['baas:mongo-activity:events:evt-000001'].properties.count = 99;
  const sent = mockFetch([
    { status: 200, body: { rows: [], affected_rows: 0 } }, // update hit nothing
    { status: 200, body: { rows: [], affected_rows: 0 } }, // authoritative get: truly gone
  ]);
  writes.persist(next, prev);
  await tick();
  assert.equal(sent[1].body.op, 'get'); // refetch the authoritative row
  assert.ok(events.some((event) => event.type === 'page-deleted'));
  writes.stop();
});

test('mongo insert sends op=insert and never carries _id (server assigns it)', async () => {
  const { writes, events } = newWrites();
  const prev = buildLiveState(MONGO_SCHEMA, REF, { events: MONGO_ROWS });
  writes.noteLoadedPages(prev.pages);
  const next = structuredClone(prev);
  next.pages['temp-evt'] = { ...buildLivePage(MONGO_ROWS[0], EVENTS, prev.databases[DB_ID], REF), id: 'temp-evt' };
  next.pages['temp-evt'].properties = { name: 'signup', kind: 'auth', count: 1 };
  const sent = mockFetch([{ status: 200, body: { rows: [{ id: 'evt-000777', name: 'signup', kind: 'auth', count: 1 }], affected_rows: 1 } }]);
  writes.persist(next, prev);
  await tick();
  assert.equal(sent[0].body.op, 'insert');
  assert.equal((sent[0].body.data as Record<string, unknown>)._id, undefined); // mongo pk never sent on insert
  assert.ok(events.some((event) => event.type === 'page-inserted'));
  writes.stop();
});
