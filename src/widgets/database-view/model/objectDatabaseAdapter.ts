import { RemoteAdapter, type ObjectDatabaseAdapter } from '@notion-db/object-database';

const DEFAULT_CONTRACT_SERVER_URL = 'http://localhost:4100';

let sharedAdapter: ObjectDatabaseAdapter | null = null;

export function getObjectDatabaseAdapter(): ObjectDatabaseAdapter {
  sharedAdapter ??= new RemoteAdapter({
    baseUrl: import.meta.env.VITE_CONTRACT_SERVER_URL || DEFAULT_CONTRACT_SERVER_URL,
    token: import.meta.env.VITE_CONTRACT_SERVER_TOKEN || undefined,
  });

  return sharedAdapter;
}
