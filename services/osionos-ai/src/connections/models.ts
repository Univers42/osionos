import type { Redis } from 'ioredis';
import { guardedShortFetch } from './endpointGuard.ts';
import { connectionBaseUrl } from './service.ts';
import type { ConnectionRow } from './repo.ts';

/**
 * The models of a connection: the list the provider answers, in the shape
 * the client shows.
 *
 * The list of a provider changes rarely, so it is cached for ten minutes
 * under `ai:models:<connectionId>`.
 */

/** One model of the list: the id, the label, and the default flag. */
export interface ConnectionModel {
	id: string;
	label: string;
	default: boolean;
}

/** The key of the cache of the models of a connection. */
export function modelsCacheKey(connectionId: string): string {
	return `ai:models:${connectionId}`;
}

/** The models of an OpenAI-compatible list: the ids, in the order they come. */
function idsOf(payload: unknown): string[] {
	const data = (payload as { data?: unknown } | null)?.data;
	if (!Array.isArray(data)) return [];
	const ids: string[] = [];
	for (const entry of data) {
		const id = (entry as { id?: unknown } | null)?.id;
		if (typeof id === 'string' && id.length > 0) ids.push(id);
	}
	return ids;
}

/**
 * The models of a connection.
 *
 * A provider that does not answer gives an empty list: the models of a
 * connection are a convenience of the picker, and an empty list never breaks
 * the client. Nothing is cached then, so the next call tries again.
 */
export async function connectionModels(
	redis: Redis,
	row: ConnectionRow,
	secret: string | null,
): Promise<ConnectionModel[]> {
	const key = modelsCacheKey(row.id);
	const cached = await redis.get(key);
	if (cached) {
		try {
			const parsed = JSON.parse(cached) as ConnectionModel[];
			if (Array.isArray(parsed)) return parsed;
		} catch {
			// A broken cache entry is a miss, not a failure.
		}
	}
	const baseUrl = await connectionBaseUrl(redis, row);
	if (!baseUrl) return [];
	const url = `${baseUrl.replace(/\/+$/, '')}/models`;
	try {
		const response = await guardedShortFetch(
			url,
			secret ? { headers: { authorization: `Bearer ${secret}` } } : {},
		);
		if (!response.ok) return [];
		const ids = idsOf(await response.json());
		const models = ids.map((id, index) => ({ id, label: id, default: index === 0 }));
		if (models.length > 0) await redis.set(key, JSON.stringify(models), 'EX', 600);
		return models;
	} catch {
		return [];
	}
}
