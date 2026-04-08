/** @file MongoDbAdapter.ts — Connects to MongoDB and performs CRUD on collections. */

import { MongoClient, type Db, type Document } from 'mongodb';
import type { DbAdapter, DbConnectionConfig, DbEntitySchema, DbRecord } from './types.ts';
import { DbMemoCache } from './DbMemoCache.ts';
import { inferSchema } from './inferSchema.ts';

/** Convert a MongoDB document to a DbRecord (map _id → id). */
function docToRecord(doc: Document): DbRecord {
  const { _id, ...rest } = doc;
  return { id: String(_id), ...rest } as DbRecord;
}

export class MongoDbAdapter implements DbAdapter {
  readonly sourceName = 'MongoDB';
  readonly sourceType = 'mongodb' as const;

  private client: MongoClient | null = null;
  private db: Db | null = null;
  private readonly uri: string;
  private readonly dbName: string;
  private readonly cache = new DbMemoCache();

  constructor(config: DbConnectionConfig) {
    if (!config.mongoUri) throw new Error('MongoDbAdapter requires mongoUri');
    if (!config.mongoDb) throw new Error('MongoDbAdapter requires mongoDb');
    this.uri = config.mongoUri;
    this.dbName = config.mongoDb;
  }

  async connect(): Promise<void> {
    if (this.client) return;
    this.client = new MongoClient(this.uri);
    await this.client.connect();
    this.db = this.client.db(this.dbName);
  }

  async disconnect(): Promise<void> {
    this.cache.clear();
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  async listEntities(): Promise<string[]> {
    const db = this.ensureConnected();
    const cached = this.cache.get<string[]>('entities');
    if (cached) return cached;

    const collections = await db.listCollections().toArray();
    const names = collections.map((c) => c.name).filter((n) => !n.startsWith('system.'));
    this.cache.set('entities', names);
    return names;
  }

  async getRecords(entity: string): Promise<DbRecord[]> {
    const db = this.ensureConnected();
    const key = `records:${entity}`;
    const cached = this.cache.get<DbRecord[]>(key);
    if (cached) return cached;

    const docs = await db.collection(entity).find().toArray();
    const records = docs.map(docToRecord);
    this.cache.set(key, records);
    return records;
  }

  async getRecord(entity: string, id: string): Promise<DbRecord | null> {
    const db = this.ensureConnected();
    const doc = await db.collection(entity).findOne({ _id: id as unknown as Document['_id'] });
    return doc ? docToRecord(doc) : null;
  }

  async updateRecord(
    entity: string, id: string, field: string, value: unknown,
  ): Promise<DbRecord> {
    const db = this.ensureConnected();
    const result = await db.collection(entity).findOneAndUpdate(
      { _id: id as unknown as Document['_id'] },
      { $set: { [field]: value } },
      { returnDocument: 'after' },
    );
    if (!result) throw new Error(`Record ${id} not found in ${entity}`);
    this.cache.invalidatePrefix(`records:${entity}`);
    return docToRecord(result);
  }

  async insertRecord(entity: string, record: Omit<DbRecord, 'id'>): Promise<DbRecord> {
    const db = this.ensureConnected();
    const doc = { ...record };
    const result = await db.collection(entity).insertOne(doc);
    this.cache.invalidatePrefix(`records:${entity}`);
    return { id: String(result.insertedId), ...record } as DbRecord;
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
      const db = this.ensureConnected();
      await db.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  private ensureConnected(): Db {
    if (!this.db) throw new Error('MongoDbAdapter: not connected. Call connect() first.');
    return this.db;
  }
}
