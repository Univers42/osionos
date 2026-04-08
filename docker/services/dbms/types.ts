/** @file types.ts — Shared types and interfaces for all database adapters. */

/** Supported database source types. */
export type DbSourceType = 'json' | 'csv' | 'mongodb' | 'postgresql';

/** A single data record returned by any adapter. */
export interface DbRecord {
  id: string;
  [key: string]: unknown;
}

/** Schema description for a collection/table. */
export interface DbFieldSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'unknown';
  nullable: boolean;
}

/** Schema for an entire entity. */
export interface DbEntitySchema {
  entity: string;
  fields: DbFieldSchema[];
  recordCount: number;
}

/** Connection configuration passed to adapters. */
export interface DbConnectionConfig {
  /** For file-based adapters (json, csv): base directory path. */
  basePath?: string;
  /** For MongoDB: full connection URI. */
  mongoUri?: string;
  /** For MongoDB: database name. */
  mongoDb?: string;
  /** For PostgreSQL: full connection string. */
  databaseUrl?: string;
}

/** The universal adapter interface every source must implement. */
export interface DbAdapter {
  /** Human-readable name of this source. */
  readonly sourceName: string;
  /** The source type key. */
  readonly sourceType: DbSourceType;
  /** Connect / initialise (idempotent). */
  connect(): Promise<void>;
  /** Gracefully shut down any connections. */
  disconnect(): Promise<void>;
  /** List all available entity names (tables / collections / files). */
  listEntities(): Promise<string[]>;
  /** Fetch all records for an entity. */
  getRecords(entity: string): Promise<DbRecord[]>;
  /** Fetch a single record by id. */
  getRecord(entity: string, id: string): Promise<DbRecord | null>;
  /** Update a single field on a record. Returns the updated record. */
  updateRecord(entity: string, id: string, field: string, value: unknown): Promise<DbRecord>;
  /** Insert a new record. Returns the inserted record with its id. */
  insertRecord(entity: string, record: Omit<DbRecord, 'id'>): Promise<DbRecord>;
  /** Get the schema for an entity. */
  getSchema(entity: string): Promise<DbEntitySchema>;
  /** Health check — returns true if the source is reachable. */
  ping(): Promise<boolean>;
}
