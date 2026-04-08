/** @file CsvDbAdapter.ts — Reads and writes CSV seed files from a local directory. */

import { readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse } from 'csv-parse/sync';
import type { DbAdapter, DbConnectionConfig, DbEntitySchema, DbRecord } from './types.ts';
import { DbMemoCache } from './DbMemoCache.ts';
import { inferSchema } from './inferSchema.ts';

/** Convert pipe-separated strings back to arrays where appropriate. */
function coerceValue(value: string): unknown {
  if (value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.includes('|')) return value.split('|');
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== '') return num;
  return value;
}

export class CsvDbAdapter implements DbAdapter {
  readonly sourceName = 'CSV Files';
  readonly sourceType = 'csv' as const;

  private readonly basePath: string;
  private readonly cache = new DbMemoCache();

  constructor(config: DbConnectionConfig) {
    if (!config.basePath) throw new Error('CsvDbAdapter requires basePath');
    this.basePath = config.basePath;
  }

  async connect(): Promise<void> {
    readdirSync(this.basePath);
  }

  async disconnect(): Promise<void> {
    this.cache.clear();
  }

  async listEntities(): Promise<string[]> {
    const cached = this.cache.get<string[]>('entities');
    if (cached) return cached;

    const files = readdirSync(this.basePath)
      .filter((f) => f.endsWith('.csv'))
      .map((f) => basename(f, '.csv'));
    this.cache.set('entities', files);
    return files;
  }

  async getRecords(entity: string): Promise<DbRecord[]> {
    const key = `records:${entity}`;
    const cached = this.cache.get<DbRecord[]>(key);
    if (cached) return cached;

    const filePath = join(this.basePath, `${entity}.csv`);
    const raw = readFileSync(filePath, 'utf-8');
    const rows = parse(raw, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

    const records: DbRecord[] = rows.map((row) => {
      const record: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        record[key] = coerceValue(value);
      }
      return record as DbRecord;
    });

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
    this.writeCsv(entity, records);
    this.cache.invalidatePrefix(`records:${entity}`);
    return record;
  }

  async insertRecord(entity: string, record: Omit<DbRecord, 'id'>): Promise<DbRecord> {
    const records = await this.getRecords(entity);
    const newRecord: DbRecord = { id: crypto.randomUUID(), ...record };
    records.push(newRecord);
    this.writeCsv(entity, records);
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

  /** Serialize records back to CSV and write atomically. */
  private writeCsv(entity: string, records: DbRecord[]): void {
    if (records.length === 0) return;

    const headers = Object.keys(records[0]);
    const lines = [headers.join(',')];

    for (const record of records) {
      const values = headers.map((h) => {
        const val = (record as Record<string, unknown>)[h];
        if (val === null || val === undefined) return '';
        if (Array.isArray(val)) return `"${val.join('|')}"`;
        let str: string;
        if (typeof val === 'string') {
          str = val;
        } else if (typeof val === 'number' || typeof val === 'boolean') {
          str = String(val);
        } else {
          str = JSON.stringify(val);
        }
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replaceAll('"', '""')}"`;
        }
        return str;
      });
      lines.push(values.join(','));
    }

    const filePath = join(this.basePath, `${entity}.csv`);
    const tmpPath = join(this.basePath, `.${entity}.csv.tmp`);
    writeFileSync(tmpPath, lines.join('\n') + '\n', 'utf-8');
    renameSync(tmpPath, filePath);
  }
}
