/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-adapter-fixtures.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* Shared fixtures for the per-engine LiveMountAdapter tests. The env block runs
 * at module load — imported FIRST by every adapter test so liveMountClient /
 * liveWriteClient (which read VITE_BAAS_* into module-load consts) are
 * configured. Schemas mirror the GET /query/v1/:dbId/schema wire contract for
 * the seeded multi-engine mounts (pg-commerce orders, mysql-ops tasks,
 * mongo-activity events). */

(import.meta as { env?: Record<string, string> }).env = {
  VITE_BAAS_URL: 'http://baas.test',
  VITE_BAAS_API_KEY: 'test-api-key',
};

import type {
  LiveColumnSchema,
  LiveSchemaResponse,
  LiveTableSchema,
} from '../../src/shared/notion-database-sys/src/store/live/liveTypes.ts';

/** One scripted fetch request the mock recorded. */
export interface SentRequest {
  url: string;
  method: string;
  body: Record<string, unknown>;
}

/** One scripted fetch response (status + JSON payload), shifted in order. */
export interface ScriptedResponse {
  status: number;
  body: unknown;
}

/** Build a wire ColumnSchema with the seeded-shape defaults. */
export function col(
  name: string,
  normalized_type: LiveColumnSchema['normalized_type'],
  extra: Partial<LiveColumnSchema> = {},
): LiveColumnSchema {
  return {
    name,
    native_type: normalized_type,
    normalized_type,
    nullable: true,
    default: null,
    enum_values: null,
    references: null,
    inferred: false,
    ...extra,
  };
}

/** Build a wire TableSchema. */
export function table(
  name: string,
  primary_key: string[],
  columns: LiveColumnSchema[],
): LiveTableSchema {
  return { name, primary_key, columns };
}

/** pg-commerce `orders` mount (integer pk, enum status, FK customer). */
export const PG_SCHEMA: LiveSchemaResponse = {
  dbId: 'pg-commerce',
  engine: 'postgresql',
  capabilities: { transactions: true, aggregate: true },
  tables: [
    table('orders', ['id'], [
      col('id', 'integer'),
      col('customer_id', 'integer', {
        references: { table: 'customers', column: 'id' },
      }),
      col('status', 'enum', { enum_values: ['pending', 'confirmed', 'shipped'] }),
      col('total', 'decimal'),
      col('created_at', 'datetime'),
    ]),
    table('customers', ['id'], [col('id', 'integer'), col('name', 'text')]),
  ],
};

/** mysql-ops `tasks` mount (integer pk, FK project, enum priority). */
export const MYSQL_SCHEMA: LiveSchemaResponse = {
  dbId: 'mysql-ops',
  engine: 'mysql',
  capabilities: { transactions: true, aggregate: false },
  tables: [
    table('tasks', ['id'], [
      col('id', 'integer'),
      col('title', 'text'),
      col('project_id', 'integer', {
        references: { table: 'projects', column: 'id' },
      }),
      col('priority', 'enum', { enum_values: ['low', 'high'] }),
      col('done', 'boolean'),
    ]),
    table('projects', ['id'], [col('id', 'integer'), col('name', 'text')]),
  ],
};

/** mongo-activity `events` mount (string `_id`, no transactions). */
export const MONGO_SCHEMA: LiveSchemaResponse = {
  dbId: 'mongo-activity',
  engine: 'mongodb',
  capabilities: { transactions: false, aggregate: false },
  tables: [
    table('events', ['_id'], [
      col('_id', 'objectid'),
      col('name', 'text'),
      col('kind', 'text'),
      col('count', 'integer'),
    ]),
  ],
};

/** Realistic first-page rows per engine (seeded-shape values). */
export const PG_ROWS: Record<string, unknown>[] = [
  { id: 1234, customer_id: 42, status: 'pending', total: 19.99, created_at: '2026-06-25T10:00:00.000Z' },
  { id: 1235, customer_id: 43, status: 'shipped', total: 5.5, created_at: '2026-06-25T11:00:00.000Z' },
];
export const MYSQL_ROWS: Record<string, unknown>[] = [
  { id: 7, title: 'Wire the gate', project_id: 3, priority: 'high', done: false },
  { id: 8, title: 'Seed mongo', project_id: 3, priority: 'low', done: true },
];
export const MONGO_ROWS: Record<string, unknown>[] = [
  { id: 'evt-000001', name: 'login', kind: 'auth', count: 3 },
  { id: 'evt-000002', name: 'view', kind: 'page', count: 9 },
];

/** Stub globalThis.fetch with a scripted response queue; records every call.
 *  Empty/overrun queue replies 200 `{rows:[],affected_rows:1}` (a benign ok). */
export function mockFetch(responses: ScriptedResponse[]): SentRequest[] {
  const sent: SentRequest[] = [];
  globalThis.fetch = (async (url: unknown, init?: { method?: string; body?: string }) => {
    sent.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {},
    });
    const next = responses.shift() ?? { status: 200, body: { rows: [], affected_rows: 1 } };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    };
  }) as unknown as typeof fetch;
  return sent;
}
