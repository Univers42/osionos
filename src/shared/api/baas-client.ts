/**
 * Thin wrapper around the Prismatica BaaS query API.
 *
 * It mirrors local data-adapter operations so switching from local data to BaaS
 * remains a configuration decision instead of a broad application rewrite.
 */

const BAAS_URL = ((import.meta.env as Record<string, string>)['VITE_BAAS_URL'] ?? '').trim();
const BAAS_ENABLED = ((import.meta.env as Record<string, string>)['VITE_BAAS_ENABLED'] ?? '') === 'true';

type BaasAction = 'read' | 'create' | 'update' | 'delete';

export interface BaasQueryOptions {
  collection: string;
  action: BaasAction;
  filter?: Record<string, unknown>;
  data?: Record<string, unknown>;
  jwt: string;
}

export async function baasQuery<T>(opts: BaasQueryOptions): Promise<T> {
  if (!BAAS_ENABLED || !BAAS_URL) {
    throw new Error('[BaaS] Not enabled. Set VITE_BAAS_ENABLED=true and VITE_BAAS_URL.');
  }

  const res = await fetch(`${BAAS_URL}/query/v1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.jwt}`,
    },
    body: JSON.stringify({
      engine: 'mongodb',
      collection: opts.collection,
      action: opts.action,
      filter: opts.filter,
      data: opts.data,
    }),
  });

  if (!res.ok) {
    throw new Error(`[BaaS] ${opts.action} ${opts.collection} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const isBaasEnabled = (): boolean => BAAS_ENABLED;