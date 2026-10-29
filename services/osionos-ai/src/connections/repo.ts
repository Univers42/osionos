import type { Pool, QueryResultRow } from 'pg';

/**
 * The rows of the connections: the table `ai_connections` of the migration.
 *
 * The owner filter is the gate of every read: a connection of somebody else
 * does not exist for the caller, and the service never answers 403.
 */

export interface ConnectionRow extends QueryResultRow {
	id: string;
	owner_user_id: string;
	kind: 'api_key' | 'oauth' | 'endpoint';
	provider: string;
	label: string;
	base_url: string | null;
	last4: string | null;
	secret_box: Buffer | null;
	wrapped_dek: Buffer | null;
	kek_id: string | null;
	status: 'ok' | 'error' | 'untested';
	status_message: string | null;
	created_at: Date;
	updated_at: Date;
}

const COLUMNS =
	'id, owner_user_id, kind, provider, label, base_url, last4, secret_box, wrapped_dek, kek_id, status, status_message, created_at, updated_at';

/** The row of a new connection, with its id already chosen. */
export interface NewConnection {
	id: string;
	ownerUserId: string;
	kind: 'api_key' | 'oauth' | 'endpoint';
	provider: string;
	label: string;
	baseUrl: string | null;
	last4: string | null;
	secretBox: Buffer | null;
	wrappedDek: Buffer | null;
	kekId: string | null;
}

/** The insertion of a connection: the id is the caller's, so it is the key. */
export async function insertConnection(db: Pool, row: NewConnection): Promise<ConnectionRow> {
	const result = await db.query<ConnectionRow>(
		`insert into public.ai_connections
		   (id, owner_user_id, kind, provider, label, base_url, last4, secret_box, wrapped_dek, kek_id)
		 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 returning ${COLUMNS}`,
		[
			row.id,
			row.ownerUserId,
			row.kind,
			row.provider,
			row.label,
			row.baseUrl,
			row.last4,
			row.secretBox,
			row.wrappedDek,
			row.kekId,
		],
	);
	return result.rows[0];
}

/** The caller's own connections, the newest first. */
export async function listOwnedConnections(db: Pool, ownerUserId: string): Promise<ConnectionRow[]> {
	const result = await db.query<ConnectionRow>(
		`select ${COLUMNS} from public.ai_connections
		 where owner_user_id = $1
		 order by created_at desc, id desc`,
		[ownerUserId],
	);
	return result.rows;
}

/** One connection, but only when the caller owns it. */
export async function getOwnedConnection(
	db: Pool,
	{ id, ownerUserId }: { id: string; ownerUserId: string },
): Promise<ConnectionRow | null> {
	const result = await db.query<ConnectionRow>(
		`select ${COLUMNS} from public.ai_connections where id = $1 and owner_user_id = $2 limit 1`,
		[id, ownerUserId],
	);
	return result.rows[0] ?? null;
}

/** The number of connections the caller has: the cap is twenty. */
export async function countOwnedConnections(db: Pool, ownerUserId: string): Promise<number> {
	const result = await db.query<{ count: string }>(
		'select count(*)::text as count from public.ai_connections where owner_user_id = $1',
		[ownerUserId],
	);
	return Number(result.rows[0]?.count ?? 0);
}

/** The deletion of a connection of the caller: nothing else is deleted. */
export async function deleteOwnedConnection(
	db: Pool,
	{ id, ownerUserId }: { id: string; ownerUserId: string },
): Promise<boolean> {
	const result = await db.query(
		'delete from public.ai_connections where id = $1 and owner_user_id = $2 returning id',
		[id, ownerUserId],
	);
	return result.rowCount === 1;
}

/** The status of a connection, after its test. */
export async function updateConnectionStatus(
	db: Pool,
	id: string,
	status: 'ok' | 'error' | 'untested',
	statusMessage: string | null,
): Promise<void> {
	await db.query(
		`update public.ai_connections
		 set status = $2, status_message = $3, updated_at = now()
		 where id = $1`,
		[id, status, statusMessage],
	);
}
