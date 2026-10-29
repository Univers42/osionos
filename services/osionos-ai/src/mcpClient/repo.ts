import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { StoredTool } from './schema.ts';

/**
 * The rows of the MCP servers and of their tool snapshots.
 *
 * Every read and write names the owner: a server of somebody else does not
 * exist for the caller (C289). The list never selects a box column (C271);
 * only `getOwnedWithBox` does, and only discovery calls it.
 */

export interface ServerRow extends QueryResultRow {
	id: string;
	owner_id: string;
	label: string;
	url: string;
	header_name: string | null;
	header_last4: string | null;
	status: 'new' | 'ok' | 'failing' | 'broken';
	consecutive_failures: number;
	broken_until: Date | null;
	/** Computed by the database clock, the one the breaker was written with. */
	is_broken: boolean;
}

export interface ServerWithBox extends ServerRow {
	header_ciphertext: Buffer | null;
	header_wrapped_dek: Buffer | null;
	header_kek_id: string | null;
}

export interface ToolRow extends QueryResultRow {
	server_id: string;
	name: string;
	description: string;
	enabled: boolean;
}

const COLUMNS =
	'id, owner_id, label, url, header_name, header_last4, status, consecutive_failures, broken_until, (broken_until is not null and broken_until > now()) as is_broken';
const BOX_COLUMNS = `${COLUMNS}, header_ciphertext, header_wrapped_dek, header_kek_id`;

export interface NewServer {
	id: string;
	ownerId: string;
	label: string;
	url: string;
	header: { name: string; last4: string; box: Buffer; wrappedDek: Buffer; kekId: string } | null;
}

/** Runs `work` in a transaction on one connection. */
async function inTransaction<T>(db: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await db.connect();
	try {
		await client.query('begin');
		const result = await work(client);
		await client.query('commit');
		return result;
	} catch (error) {
		await client.query('rollback').catch(() => undefined);
		throw error;
	} finally {
		client.release();
	}
}

/**
 * Inserts a server unless the owner already has `max` of them.
 *
 * The advisory lock makes count-then-insert one step per owner: two parallel
 * creates cannot both pass at nine (C276).
 */
export async function insertServer(db: Pool, row: NewServer, max: number): Promise<ServerRow | null> {
	return inTransaction(db, async (client) => {
		await client.query('select pg_advisory_xact_lock(hashtext($1))', [`mcp-servers:${row.ownerId}`]);
		const count = await client.query<{ n: string }>(
			'select count(*) as n from public.ai_mcp_servers where owner_id = $1',
			[row.ownerId],
		);
		if (Number(count.rows[0]?.n ?? 0) >= max) return null;
		const result = await client.query<ServerRow>(
			`insert into public.ai_mcp_servers
			   (id, owner_id, label, url, header_name, header_ciphertext, header_wrapped_dek, header_kek_id, header_last4)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			 returning ${COLUMNS}`,
			[
				row.id,
				row.ownerId,
				row.label,
				row.url,
				row.header?.name ?? null,
				row.header?.box ?? null,
				row.header?.wrappedDek ?? null,
				row.header?.kekId ?? null,
				row.header?.last4 ?? null,
			],
		);
		return result.rows[0] ?? null;
	});
}

export async function listServers(db: Pool, ownerId: string): Promise<{ servers: ServerRow[]; tools: ToolRow[] }> {
	const servers = await db.query<ServerRow>(
		`select ${COLUMNS} from public.ai_mcp_servers where owner_id = $1 order by created_at desc, id`,
		[ownerId],
	);
	const tools = await db.query<ToolRow>(
		`select t.server_id, t.name, t.description, t.enabled
		   from public.ai_mcp_tools t join public.ai_mcp_servers s on s.id = t.server_id
		  where s.owner_id = $1 order by t.name`,
		[ownerId],
	);
	return { servers: servers.rows, tools: tools.rows };
}

export async function getOwned(db: Pool, id: string, ownerId: string): Promise<ServerRow | null> {
	const result = await db.query<ServerRow>(
		`select ${COLUMNS} from public.ai_mcp_servers where id = $1 and owner_id = $2`,
		[id, ownerId],
	);
	return result.rows[0] ?? null;
}

export async function getOwnedWithBox(db: Pool, id: string, ownerId: string): Promise<ServerWithBox | null> {
	const result = await db.query<ServerWithBox>(
		`select ${BOX_COLUMNS} from public.ai_mcp_servers where id = $1 and owner_id = $2`,
		[id, ownerId],
	);
	return result.rows[0] ?? null;
}

export interface ServerPatch {
	label?: string;
	/** A new URL always travels with a new header box (C270). */
	url?: string;
	header?: NewServer['header'];
}

/**
 * Updates a server. A new URL switches every tool off and resets the breaker
 * in the same transaction (C270): the tools were enabled for another host.
 */
export async function patchServer(db: Pool, id: string, ownerId: string, patch: ServerPatch): Promise<ServerRow | null> {
	return inTransaction(db, async (client) => {
		const current = await client.query('select 1 from public.ai_mcp_servers where id = $1 and owner_id = $2 for update', [
			id,
			ownerId,
		]);
		if (current.rowCount === 0) return null;
		if (patch.label !== undefined) {
			await client.query('update public.ai_mcp_servers set label = $3, updated_at = now() where id = $1 and owner_id = $2', [
				id,
				ownerId,
				patch.label,
			]);
		}
		if (patch.url !== undefined) {
			await client.query(
				`update public.ai_mcp_servers
				    set url = $3, header_name = $4, header_ciphertext = $5, header_wrapped_dek = $6,
				        header_kek_id = $7, header_last4 = $8, status = 'new', consecutive_failures = 0,
				        broken_until = null, updated_at = now()
				  where id = $1 and owner_id = $2`,
				[
					id,
					ownerId,
					patch.url,
					patch.header?.name ?? null,
					patch.header?.box ?? null,
					patch.header?.wrappedDek ?? null,
					patch.header?.kekId ?? null,
					patch.header?.last4 ?? null,
				],
			);
			await client.query('update public.ai_mcp_tools set enabled = false where server_id = $1', [id]);
		}
		const result = await client.query<ServerRow>(`select ${COLUMNS} from public.ai_mcp_servers where id = $1`, [id]);
		return result.rows[0] ?? null;
	});
}

export async function deleteOwned(db: Pool, id: string, ownerId: string): Promise<boolean> {
	const result = await db.query('delete from public.ai_mcp_servers where id = $1 and owner_id = $2', [id, ownerId]);
	return (result.rowCount ?? 0) > 0;
}

/** Sets the user's choice for one tool; false when the server or the tool is not theirs. */
export async function setToolEnabled(
	db: Pool,
	serverId: string,
	ownerId: string,
	name: string,
	enabled: boolean,
): Promise<boolean> {
	const result = await db.query(
		`update public.ai_mcp_tools t set enabled = $4
		   from public.ai_mcp_servers s
		  where t.server_id = s.id and s.id = $1 and s.owner_id = $2 and t.name = $3`,
		[serverId, ownerId, name, enabled],
	);
	return (result.rowCount ?? 0) > 0;
}

/**
 * Stores the snapshot of a discovery and marks the server healthy.
 *
 * A new tool is stored OFF. A tool whose hash did not change keeps the user's
 * choice. A tool whose hash changed goes OFF again (C272): the user agreed to
 * other words. A tool the server no longer lists is deleted.
 */
export async function applySnapshot(db: Pool, serverId: string, tools: StoredTool[]): Promise<ToolRow[]> {
	return inTransaction(db, async (client) => {
		const names = tools.map((tool) => tool.name);
		await client.query('delete from public.ai_mcp_tools where server_id = $1 and not (name = any($2::text[]))', [
			serverId,
			names,
		]);
		for (const tool of tools) {
			await client.query(
				`insert into public.ai_mcp_tools (server_id, name, description, input_schema, snapshot_sha256, enabled)
				 values ($1, $2, $3, $4::jsonb, $5, false)
				 on conflict (server_id, name) do update
				   set description = excluded.description,
				       input_schema = excluded.input_schema,
				       enabled = case when ai_mcp_tools.snapshot_sha256 = excluded.snapshot_sha256
				                      then ai_mcp_tools.enabled else false end,
				       snapshot_sha256 = excluded.snapshot_sha256,
				       discovered_at = now()`,
				[serverId, tool.name, tool.description, JSON.stringify(tool.inputSchema), tool.sha256],
			);
		}
		await client.query(
			`update public.ai_mcp_servers
			    set status = 'ok', consecutive_failures = 0, broken_until = null, updated_at = now()
			  where id = $1`,
			[serverId],
		);
		const result = await client.query<ToolRow>(
			'select server_id, name, description, enabled from public.ai_mcp_tools where server_id = $1 order by name',
			[serverId],
		);
		return result.rows;
	});
}

/**
 * Counts a failure; the third in a row opens the breaker for five minutes (C290).
 * The arithmetic is one statement, so two parallel failures both count.
 */
export async function recordFailure(db: Pool, serverId: string): Promise<void> {
	await db.query(
		`update public.ai_mcp_servers
		    set consecutive_failures = consecutive_failures + 1,
		        status = case when consecutive_failures + 1 >= 3 then 'broken' else 'failing' end,
		        broken_until = case when consecutive_failures + 1 >= 3
		                            then now() + interval '5 minutes' else broken_until end,
		        updated_at = now()
		  where id = $1`,
		[serverId],
	);
}

/** A call went through: the run of failures ends (C290). */
export async function recordSuccess(db: Pool, serverId: string): Promise<void> {
	await db.query(
		`update public.ai_mcp_servers
		    set consecutive_failures = 0, status = 'ok', broken_until = null, updated_at = now()
		  where id = $1`,
		[serverId],
	);
}

/** One enabled tool of a working server, with the words and the hash the user agreed to. */
export interface EnabledTool extends QueryResultRow {
	server_id: string;
	label: string;
	url: string;
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
	snapshot_sha256: string;
}

/**
 * The tools a run may offer: enabled by the user, on a server that is not
 * broken (C266, C290). The order is fixed, so the generated names are stable
 * from one run to the next.
 */
export async function listEnabledTools(db: Pool, ownerId: string): Promise<EnabledTool[]> {
	const result = await db.query<EnabledTool>(
		`select t.server_id, s.label, s.url, t.name, t.description, t.input_schema, t.snapshot_sha256
		   from public.ai_mcp_tools t join public.ai_mcp_servers s on s.id = t.server_id
		  where s.owner_id = $1 and t.enabled
		    and not (s.broken_until is not null and s.broken_until > now())
		  order by s.created_at, s.id, t.name`,
		[ownerId],
	);
	return result.rows;
}

/** The snapshot of one tool as it is NOW, for the checks of the decision (C272). */
export async function getToolNow(
	db: Pool,
	serverId: string,
	ownerId: string,
	name: string,
): Promise<(EnabledTool & { enabled: boolean }) | null> {
	const result = await db.query<EnabledTool & { enabled: boolean }>(
		`select t.server_id, s.label, s.url, t.name, t.description, t.input_schema, t.snapshot_sha256, t.enabled
		   from public.ai_mcp_tools t join public.ai_mcp_servers s on s.id = t.server_id
		  where s.id = $1 and s.owner_id = $2 and t.name = $3`,
		[serverId, ownerId, name],
	);
	return result.rows[0] ?? null;
}

/** The MCP calls a user has waiting for a decision (C283). */
export async function countPendingCalls(db: Pool, ownerId: string): Promise<number> {
	const result = await db.query<{ n: string }>(
		`select count(*)::text as n from public.ai_approvals
		  where owner_id = $1 and tool = 'mcp_call' and status = 'pending' and expires_at > now()`,
		[ownerId],
	);
	return Number(result.rows[0]?.n ?? 0);
}
