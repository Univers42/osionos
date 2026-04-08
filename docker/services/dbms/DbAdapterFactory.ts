/** @file DbAdapterFactory.ts — Creates a DbAdapter for the given source type. */

import type { DbAdapter, DbConnectionConfig, DbSourceType } from './types.ts';
import { JsonDbAdapter } from './JsonDbAdapter.ts';
import { CsvDbAdapter } from './CsvDbAdapter.ts';
import { MongoDbAdapter } from './MongoDbAdapter.ts';
import { PostgresDbAdapter } from './PostgresDbAdapter.ts';

const ADAPTER_CONSTRUCTORS: Record<DbSourceType, new (config: DbConnectionConfig) => DbAdapter> = {
  json: JsonDbAdapter,
  csv: CsvDbAdapter,
  mongodb: MongoDbAdapter,
  postgresql: PostgresDbAdapter,
};

/** Create a DbAdapter for the given source type. Does NOT call connect(). */
export function createAdapter(sourceType: DbSourceType, config: DbConnectionConfig): DbAdapter {
  const Ctor = ADAPTER_CONSTRUCTORS[sourceType];
  if (!Ctor) {
    throw new Error(`Unknown DB source type: ${sourceType}`);
  }
  return new Ctor(config);
}

/** Build a DbConnectionConfig from environment variables. */
export function configFromEnv(env: Record<string, string | undefined> = {}): DbConnectionConfig {
  return {
    basePath: env.JSON_DB_PATH ?? env.CSV_DB_PATH,
    mongoUri: env.MONGO_URI,
    mongoDb: env.MONGO_DB,
    databaseUrl: env.DATABASE_URL,
  };
}

/** Read ACTIVE_DB_SOURCE from env and create a ready adapter. */
export async function createActiveAdapter(
  env: Record<string, string | undefined> = {},
): Promise<DbAdapter> {
  const sourceType = (env.ACTIVE_DB_SOURCE ?? 'json') as DbSourceType;
  const config = configFromEnv(env);

  // For file-based adapters, resolve the right path
  if (sourceType === 'json') {
    config.basePath = env.JSON_DB_PATH;
  } else if (sourceType === 'csv') {
    config.basePath = env.CSV_DB_PATH;
  }

  const adapter = createAdapter(sourceType, config);
  await adapter.connect();
  return adapter;
}
