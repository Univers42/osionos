import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { connectionAad, openSecret, sealSecret } from './crypto.ts';
import { checkEndpointUrl, guardedShortFetch } from './endpointGuard.ts';
import { findProvider, providerBaseUrl } from './providers.ts';
import { insertConnection } from './repo.ts';
import type { ConnectionRow } from './repo.ts';

/**
 * The connections of a user: the platform one, and the ones they bring.
 *
 * The secret never leaves this module in the clear: it is sealed before the
 * row is written, and it is opened only to be sent to the provider.
 */

/** The moment the service started: the creation date of the platform connection. */
export const SERVICE_STARTED_AT = new Date().toISOString();

/** The id of the platform connection: our key, our daily budget. */
export const PLATFORM_CONNECTION_ID = 'platform';

/** A connection, as the client sees it: no secret, only the last four of it. */
export interface Connection {
	id: string;
	kind: 'platform' | 'api_key' | 'oauth' | 'endpoint';
	provider: string;
	label: string;
	baseUrl?: string;
	last4?: string;
	status: 'ok' | 'error' | 'untested';
	statusMessage?: string;
	createdAt: string;
}

/** The connection of the platform: it always exists. */
export function platformConnection(): Connection {
	return {
		id: PLATFORM_CONNECTION_ID,
		kind: 'platform',
		provider: 'platform',
		label: 'Included',
		status: 'ok',
		createdAt: SERVICE_STARTED_AT,
	};
}

/** A row of the table, in the shape of the contract. */
export function toConnection(row: ConnectionRow): Connection {
	return {
		id: row.id,
		kind: row.kind,
		provider: row.provider,
		label: row.label,
		// The base URL of an endpoint is the user's own; the one of a provider
		// is ours, and the client already knows the provider.
		...(row.kind === 'endpoint' && row.base_url ? { baseUrl: row.base_url } : {}),
		...(row.last4 ? { last4: row.last4 } : {}),
		status: row.status,
		...(row.status_message ? { statusMessage: row.status_message } : {}),
		createdAt: new Date(row.created_at).toISOString(),
	};
}

/** The base URL of a connection: the user's endpoint, or the provider's. */
export function connectionBaseUrl(row: ConnectionRow): string | null {
	if (row.base_url) return row.base_url;
	const entry = findProvider(row.provider);
	return entry ? providerBaseUrl(entry) : null;
}

/** The key of a connection, opened with the associated data of its row. */
export function connectionSecret(row: ConnectionRow): string | null {
	if (!row.secret_box || !row.wrapped_dek) return null;
	return openSecret(row, connectionAad(row.id, row.owner_user_id));
}

/** What a test of a connection found. */
export interface ConnectionTest {
	status: 'ok' | 'error';
	statusMessage: string | null;
}

/**
 * The reason of a failure, in the four words the contract allows: the code of
 * the upstream, "unreachable", "timeout" or "endpoint_not_allowed".
 *
 * Nothing of the upstream's body is ever kept: the answer of a provider may
 * carry the key back in an error message.
 */
function failureStatus(error: unknown): string {
	const candidate = error as { name?: unknown; code?: unknown; cause?: { name?: unknown } } | null;
	if (candidate?.code === 'endpoint_not_allowed') return 'endpoint_not_allowed';
	if (candidate?.name === 'TimeoutError') return 'timeout';
	if (candidate?.cause?.name === 'TimeoutError') return 'timeout';
	return 'unreachable';
}

/**
 * The test of a connection: one call to the models of the provider.
 *
 * The key goes as a bearer token when there is one. The answer of the
 * provider is never read: only its status counts, so a body that carries the
 * key back never reaches the client or the log.
 */
export async function testConnection(row: ConnectionRow, secret: string | null): Promise<ConnectionTest> {
	const baseUrl = connectionBaseUrl(row);
	if (!baseUrl) return { status: 'error', statusMessage: 'unreachable' };
	let base: URL;
	try {
		base = checkEndpointUrl(baseUrl);
	} catch (error) {
		return { status: 'error', statusMessage: failureStatus(error) };
	}
	const modelsUrl = `${base.toString().replace(/\/+$/, '')}/models`;
	try {
		const response = await guardedShortFetch(
			modelsUrl,
			secret ? { headers: { authorization: `Bearer ${secret}` } } : {},
		);
		if (response.ok) return { status: 'ok', statusMessage: null };
		return { status: 'error', statusMessage: `HTTP ${response.status}` };
	} catch (error) {
		return { status: 'error', statusMessage: failureStatus(error) };
	}
}

/** What a creation of a connection asks for. */
export interface CreateConnectionRequest {
	kind: 'api_key' | 'oauth' | 'endpoint';
	provider: string;
	label: string;
	baseUrl: string | null;
	apiKey: string | null;
}

/**
 * The creation of a connection: the id is chosen here, the secret is sealed
 * under it, and the row is written with both.
 *
 * The associated data of the envelope is the id of the row and its owner, so
 * a box that is copied onto another row never opens.
 */
export async function createConnection(
	db: Pool,
	ownerUserId: string,
	request: CreateConnectionRequest,
): Promise<ConnectionRow> {
	const id = randomUUID();
	const sealed = request.apiKey ? sealSecret(request.apiKey, connectionAad(id, ownerUserId)) : null;
	return insertConnection(db, {
		id,
		ownerUserId,
		kind: request.kind,
		provider: request.provider,
		label: request.label,
		baseUrl: request.baseUrl,
		last4: request.apiKey ? request.apiKey.slice(-4) : null,
		secretBox: sealed?.secretBox ?? null,
		wrappedDek: sealed?.wrappedDek ?? null,
		kekId: sealed?.kekId ?? null,
	});
}
