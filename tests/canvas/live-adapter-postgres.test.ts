/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-adapter-postgres.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* LiveMountAdapter — postgresql engine (pg-commerce `orders` mount). Exercises
 * the adapter's real composed pipeline: schema mapping (liveSchemaMapper) →
 * state build (liveStateBuilder, the body of loadState) → server-side query
 * translation (liveQueryTranslator, the body of findPages) → pk filter
 * (liveWriteClient, the body of getPage) → the write delegate
 * (LiveAdapterWrites, exactly what adapter.persistState calls) draining a real
 * outbox over a mocked fetch. component/types is value-imported by the adapter
 * shell (AdapterError) which strip-only mode can't load, so the SAME functions
 * the adapter calls are driven directly — no leaf is mocked away. */

import {
  PG_ROWS,
  PG_SCHEMA,
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

const REF = { dbId: 'pg-commerce', table: 'orders' };
const DB_ID = 'baas:pg-commerce:orders';
const ORDERS = PG_SCHEMA.tables[0];
const tick = (ms = 700) => new Promise((resolve) => setTimeout(resolve, ms));

function newWrites(): { writes: LiveAdapterWrites; events: { type: string }[] } {
  const store = new Map<string, string>();
  const events: { type: string }[] = [];
  const writes = new LiveAdapterWrites(DB_ID, {
    getSchema: async () => PG_SCHEMA,
    emit: (event) => events.push(event),
    storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value); } },
  });
  return { writes, events };
}

test('pg schema introspection: enum→select, FK→relation, decimal→number, integer pk', () => {
  const { properties, titlePropertyId } = mapLiveTable(ORDERS, REF.dbId);
  assert.equal(properties.status.type, 'select');
  assert.deepEqual(properties.status.options?.map((option) => option.id), ['pending', 'confirmed', 'shipped']);
  assert.equal(properties.customer_id.type, 'relation');
  assert.equal(properties.customer_id.relationConfig?.databaseId, 'baas:pg-commerce:customers');
  assert.equal(properties.total.type, 'number');
  assert.equal(ORDERS.primary_key[0], 'id');
  assert.equal(titlePropertyId, 'id'); // no title/text column → falls back to pk
});

test('pg loadState builds one page per row keyed by integer pk + a relation cell', () => {
  const state = buildLiveState(PG_SCHEMA, REF, { orders: PG_ROWS });
  assert.deepEqual(Object.keys(state.pages).sort(), [
    'baas:pg-commerce:orders:1234',
    'baas:pg-commerce:orders:1235',
  ]);
  const page = state.pages['baas:pg-commerce:orders:1234'];
  assert.equal(page.databaseId, DB_ID);
  assert.deepEqual(page.properties.customer_id, ['baas:pg-commerce:customers:42']);
  assert.equal(page.properties.total, 19.99);
  assert.ok(state.databases['baas:pg-commerce:customers']); // referenced table mounted schema-only
});

test('pg findPages → sql filter/sort/limit wire params (eq + contains→$ilike)', () => {
  const { params, clientSide } = translateLivePageQuery({
    databaseId: DB_ID,
    filter: { status: { eq: 'shipped' }, total: { contains: '5' } },
    sort: [{ propertyId: 'created_at', direction: 'desc' }],
    limit: 50,
  }, PG_SCHEMA.engine);
  assert.deepEqual(params.filter, { $and: [{ status: { $eq: 'shipped' } }, { total: { $ilike: '%5%' } }] });
  assert.deepEqual(params.sort, { created_at: 'desc' });
  assert.equal(params.limit, 50);
  assert.equal(clientSide.length, 0);
});

test('pg getPage builds a numeric pk filter so SQL matches the integer column', () => {
  const filter = livePkFilter(ORDERS, '1234');
  assert.deepEqual(filter, { id: 1234 }); // coerced to number, not the string "1234"
  const page = buildLivePage(PG_ROWS[0], ORDERS, buildLiveState(PG_SCHEMA, REF, { orders: [PG_ROWS[0]] }).databases[DB_ID], REF);
  assert.equal(page.id, 'baas:pg-commerce:orders:1234');
});

test('pg persistState cell edit drains as a single-op update with an idempotency key', async () => {
  const { writes } = newWrites();
  const prev = buildLiveState(PG_SCHEMA, REF, { orders: PG_ROWS });
  writes.noteLoadedPages(prev.pages);
  const next = structuredClone(prev);
  next.pages['baas:pg-commerce:orders:1234'].properties.status = 'confirmed';
  const sent = mockFetch([{ status: 200, body: { rows: [], affected_rows: 1 } }]);
  writes.persist(next, prev);
  await tick();
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/api\/databases\/pg-commerce\/tables\/orders$/);
  assert.equal(sent[0].body.op, 'update');
  assert.equal(sent[0].body.resource, undefined); // the /txn-only field is stripped for single-op
  assert.deepEqual(sent[0].body.filter, { id: 1234 });
  assert.deepEqual(sent[0].body.data, { status: 'confirmed' });
  assert.equal(typeof sent[0].body.idempotencyKey, 'string');
  writes.stop();
});

test('pg insert drains as op=insert and the echoed real pk swaps the temp page', async () => {
  const { writes, events } = newWrites();
  const prev = buildLiveState(PG_SCHEMA, REF, { orders: PG_ROWS });
  writes.noteLoadedPages(prev.pages);
  const next = structuredClone(prev);
  next.pages['temp-new'] = { ...buildLivePage(PG_ROWS[0], ORDERS, prev.databases[DB_ID], REF), id: 'temp-new' };
  next.pages['temp-new'].properties = { status: 'pending', total: 3 };
  const sent = mockFetch([{ status: 200, body: { rows: [{ id: 9001, status: 'pending', total: 3 }], affected_rows: 1 } }]);
  writes.persist(next, prev);
  await tick();
  assert.equal(sent[0].body.op, 'insert');
  assert.equal((sent[0].body.data as Record<string, unknown>).id, undefined); // serial pk never sent
  assert.ok(events.some((event) => event.type === 'page-inserted'));
  assert.ok(events.some((event) => event.type === 'page-deleted')); // temp page removed
  writes.stop();
});

test('pg cell 409 snaps the UI back to the refetched server row (conflict reconcile)', async () => {
  const { writes, events } = newWrites();
  const prev = buildLiveState(PG_SCHEMA, REF, { orders: PG_ROWS });
  writes.noteLoadedPages(prev.pages);
  const next = structuredClone(prev);
  next.pages['baas:pg-commerce:orders:1235'].properties.total = 999;
  const sent = mockFetch([
    { status: 409, body: { message: 'check constraint' } },
    { status: 200, body: { rows: [{ id: 1235, status: 'shipped', total: 5.5 }], affected_rows: 1 } },
  ]);
  writes.persist(next, prev);
  await tick();
  assert.equal(sent[1].body.op, 'get'); // authoritative refetch
  const changed = events.find((event) => event.type === 'page-changed') as
    | { type: string; changes: Record<string, unknown> }
    | undefined;
  assert.ok(changed);
  assert.equal(changed.changes.total, 5.5); // server truth re-applied, not the rejected 999
  writes.stop();
});
