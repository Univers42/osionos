/**
 * @file smoke-test.ts — Tests all database adapters.
 *
 * Usage: npx tsx docker/services/dbms/smoke-test.ts [--all]
 * Flags: --all  Also run MongoDB and PostgreSQL tests (requires running containers).
 */

import { resolve } from 'node:path';
import { JsonDbAdapter } from './JsonDbAdapter.ts';
import { CsvDbAdapter } from './CsvDbAdapter.ts';
import { MongoDbAdapter } from './MongoDbAdapter.ts';
import { PostgresDbAdapter } from './PostgresDbAdapter.ts';
import type { DbAdapter } from './types.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const JSON_PATH = resolve(ROOT, 'src/store/dbms/json');
const CSV_PATH = resolve(ROOT, 'src/store/dbms/csv');
const DIVIDER = '─'.repeat(60);

let passed = 0;
let failed = 0;

function ok(msg: string): void {
  passed++;
  console.log(`  ✅ ${msg}`);
}

function fail(msg: string, err: unknown): void {
  failed++;
  let errMsg: string;
  if (err instanceof Error) {
    errMsg = err.message;
  } else if (typeof err === 'string') {
    errMsg = err;
  } else {
    errMsg = JSON.stringify(err);
  }
  console.error(`  ❌ ${msg}: ${errMsg}`);
}

async function testEntity(adapter: DbAdapter, entity: string): Promise<void> {
  try {
    const records = await adapter.getRecords(entity);
    ok(`getRecords('${entity}') → ${records.length} records`);

    if (records.length > 0) {
      const first = records[0];
      const fetched = await adapter.getRecord(entity, first.id);
      if (fetched?.id === first.id) {
        ok(`getRecord('${entity}', '${first.id}') → found`);
      } else {
        fail(`getRecord('${entity}', '${first.id}')`, 'not found or id mismatch');
      }
    }
  } catch (e) {
    fail(`getRecords('${entity}')`, e);
  }

  try {
    const schema = await adapter.getSchema(entity);
    ok(`getSchema('${entity}') → ${schema.fields.length} fields, ${schema.recordCount} records`);
  } catch (e) {
    fail(`getSchema('${entity}')`, e);
  }
}

async function testAdapter(adapter: DbAdapter): Promise<void> {
  console.log(`\n${DIVIDER}`);
  console.log(`Testing: ${adapter.sourceName} (${adapter.sourceType})`);
  console.log(DIVIDER);

  try {
    await adapter.connect();
    ok('connect()');
  } catch (e) {
    fail('connect()', e);
    return;
  }

  try {
    const alive = await adapter.ping();
    if (alive) ok('ping() → true');
    else fail('ping()', 'returned false');
  } catch (e) {
    fail('ping()', e);
  }

  let entities: string[] = [];
  try {
    entities = await adapter.listEntities();
    ok(`listEntities() → [${entities.join(', ')}] (${entities.length} entities)`);
  } catch (e) {
    fail('listEntities()', e);
  }

  for (const entity of entities.slice(0, 3)) {
    await testEntity(adapter, entity);
  }

  try {
    await adapter.disconnect();
    ok('disconnect()');
  } catch (e) {
    fail('disconnect()', e);
  }
}

async function main(): Promise<void> {
  const testAll = process.argv.includes('--all');

  console.log('\n🔬 DBMS Smoke Test');
  console.log(`   Mode: ${testAll ? 'ALL adapters (Docker required)' : 'File-based only'}\n`);

  // Always test file-based adapters
  await testAdapter(new JsonDbAdapter({ basePath: JSON_PATH }));
  await testAdapter(new CsvDbAdapter({ basePath: CSV_PATH }));

  // Optionally test remote adapters
  if (testAll) {
    const mongoUri = process.env.MONGO_URI ?? 'mongodb://notion_user:notion_pass@localhost:27017/notion_db?authSource=admin';
    const mongoDb = process.env.MONGO_DB ?? 'notion_db';
    await testAdapter(new MongoDbAdapter({ mongoUri, mongoDb }));

    const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://notion_user:notion_pass@localhost:5432/notion_db';
    await testAdapter(new PostgresDbAdapter({ databaseUrl }));
  }

  console.log(`\n${DIVIDER}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(DIVIDER);

  if (failed > 0) process.exit(1);
}

try {
  await main();
} catch (e) {
  console.error('Smoke test crashed:', e);
  process.exit(2);
}
