/** @file JsonDbAdapter.ts — Reads and writes JSON seed files from a local directory. */

import { readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { DbAdapter, DbConnectionConfig, DbEntitySchema, DbRecord } from './types.ts';
import { DbMemoCache } from './DbMemoCache.ts';
import { inferSchema } from './inferSchema.ts';

/** Expected shape of a JSON seed file. */
interface JsonSeedFile {
  schema?: { name: string; version?: string; fields?: unknown[] };
  records: DbRecord[];
}

/** Parse a seed file — supports both plain arrays and {schema, records} wrapper. */
function parseJsonSeed(raw: string): DbRecord[] {
  const parsed: JsonSeedFile | DbRecord[] = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.records)) return parsed.records;
  throw new Error('JSON seed file must be an array or { records: [...] }');
}

export class JsonDbAdapter implements DbAdapter {
  readonly sourceName = 'JSON Files';
  readonly sourceType = 'json' as const;

  private readonly basePath: string;
  private readonly cache = new DbMemoCache();

  constructor(config: DbConnectionConfig) {
    if (!config.basePath) throw new Error('JsonDbAdapter requires basePath');
    this.basePath = config.basePath;
  }

  async connect(): Promise<void> {
    // File-based — nothing to connect to. Validate directory exists.
    readdirSync(this.basePath);
  }

  async disconnect(): Promise<void> {
    this.cache.clear();
  }

  async listEntities(): Promise<string[]> {
    const cached = this.cache.get<string[]>('entities');
    if (cached) return cached;

    const files = readdirSync(this.basePath)
      .filter((f) => f.endsWith('.json'))
      .map((f) => basename(f, '.json'));
    this.cache.set('entities', files);
    return files;
  }

  async getRecords(entity: string): Promise<DbRecord[]> {
    const key = `records:${entity}`;
    const cached = this.cache.get<DbRecord[]>(key);
    if (cached) return cached;

    const filePath = join(this.basePath, `${entity}.json`);
    const raw = readFileSync(filePath, 'utf-8');
    const records = parseJsonSeed(raw);
    this.cache.set(key, records);
    return records;
  }

  async getRecord(entity: string, id: string): Promise<DbRecord | null> {
    const records = await this.getRecords(entity);
    return records.find((r) => r.id === id) ?? null;
  }

  async updateRecord(
    entity: string, id: string, field: string, value: unknown,
  ): Promise<DbRecord> {
    const records = await this.getRecords(entity);
    const record = records.find((r) => r.id === id);
    if (!record) throw new Error(`Record ${id} not found in ${entity}`);
    (record as Record<string, unknown>)[field] = value;
    this.atomicWrite(entity, records);
    this.cache.invalidatePrefix(`records:${entity}`);
    return record;
  }

  async insertRecord(entity: string, record: Omit<DbRecord, 'id'>): Promise<DbRecord> {
    const records = await this.getRecords(entity);
    const newRecord: DbRecord = {
      id: crypto.randomUUID(),
      ...record,
    };
    records.push(newRecord);
    this.atomicWrite(entity, records);
    this.cache.invalidatePrefix(`records:${entity}`);
    return newRecord;
  }

  async getSchema(entity: string): Promise<DbEntitySchema> {
    const records = await this.getRecords(entity);
    return {
      entity,
      fields: inferSchema(records),
      recordCount: records.length,
    };
  }

  async ping(): Promise<boolean> {
    try {
      readdirSync(this.basePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Write JSON atomically via temp file + rename, preserving wrapper format. */
  private atomicWrite(entity: string, records: DbRecord[]): void {
    const filePath = join(this.basePath, `${entity}.json`);
    const tmpPath = join(this.basePath, `.${entity}.json.tmp`);

    // Read original to detect wrapper format
    let output: string;
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed: JsonSeedFile | DbRecord[] = JSON.parse(raw);
      if (!Array.isArray(parsed) && parsed.schema) {
        output = JSON.stringify({ ...parsed, records }, null, 2);
      } else {
        output = JSON.stringify(records, null, 2);
      }
    } catch {
      output = JSON.stringify(records, null, 2);
    }

    writeFileSync(tmpPath, output, 'utf-8');
    renameSync(tmpPath, filePath);
  }
}
