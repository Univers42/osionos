import type { Pool, QueryResultRow } from 'pg';

/**
 * The rows of the personal access tokens.
 *
 * The database half is DONE and is not touched here: the table
 * `ai_access_tokens` and its four functions come from the migration
 * (models/osionos-ai-access-tokens-migration.sql). This file only calls them,
 * and it keeps the hash to itself: the list reads the columns the settings
 * page shows and NEVER `token_sha256` (C112).
 */

/** A token of the settings list: what the user sees, and no hash. */
export interface TokenRow extends QueryResultRow {
	id: string;
	name: string;
	last4: string;
	scopes: string[];
	workspace_ids: string[];
	created_at: Date;
	expires_at: Date;
	last_used_at: Date | null;
	revoked_at: Date | null;
}

/** A token that resolved: the one check every PAT request runs (C116). */
export interface ResolvedToken extends QueryResultRow {
	token_id: string;
	user_id: string;
	name: string;
	scopes: string[];
	workspace_ids: string[];
}

/** The token a mint writes: the hash, never the token. */
export interface NewToken {
	userId: string;
	name: string;
	tokenSha256: string;
	last4: string;
	scopes: string[];
	workspaceIds: string[];
	expiresAt: Date;
}

/**
 * The columns of the list.
 *
 * The hash is not one of them, and it never will be: the settings page has
 * no use for it, and a response that carries it is a response that leaks it.
 */
const LIST_COLUMNS =
	'id, name, last4, scopes, workspace_ids, created_at, expires_at, last_used_at, revoked_at';

/**
 * Creates a token and returns its id.
 *
 * The function of the database counts the live tokens of the user under an
 * advisory lock, so two parallel mints cannot both pass at nineteen: the
 * twentieth one raises 54000, and the route answers 429.
 */
export async function createToken(db: Pool, token: NewToken): Promise<string> {
	const result = await db.query<{ id: string }>(
		`select public.ai_access_token_create($1::uuid, $2::text, $3::text, $4::text, $5::text[], $6::uuid[], $7::timestamptz) as id`,
		[
			token.userId,
			token.name,
			token.tokenSha256,
			token.last4,
			token.scopes,
			token.workspaceIds,
			token.expiresAt,
		],
	);
	return String(result.rows[0]?.id ?? '');
}

/**
 * Resolves a token: the row of a live one, or null.
 *
 * No row means no: unknown, revoked, expired, or minted before the user's
 * session cut-off. There is no cache (C116): the revocation of a token is
 * effective on the next call, on every replica.
 */
export async function resolveToken(db: Pool, tokenSha256: string): Promise<ResolvedToken | null> {
	const result = await db.query<ResolvedToken>(
		'select token_id, user_id, name, scopes, workspace_ids from public.ai_access_token_resolve($1::text)',
		[tokenSha256],
	);
	return result.rows[0] ?? null;
}

/**
 * Revokes a token of the caller: true when it was live and is not any more.
 *
 * A token of somebody else, or one that was already revoked, gives false —
 * the caller hears nothing about tokens that are not theirs (C113).
 */
export async function revokeToken(db: Pool, userId: string, tokenId: string): Promise<boolean> {
	const result = await db.query<{ revoked: boolean }>(
		'select public.ai_access_token_revoke($1::uuid, $2::uuid) as revoked',
		[userId, tokenId],
	);
	return result.rows[0]?.revoked === true;
}

/**
 * The state of a token at decision time: what the re-check reads.
 *
 * It is not `resolveToken`: a decision must TELL a revoked or expired token
 * apart from a missing one in the same way (all three expire the approval), and
 * it never touches `last_used_at` — the decision is not a call of the agent.
 */
export interface TokenState extends QueryResultRow {
	id: string;
	user_id: string;
	name: string;
	workspace_ids: string[];
	expires_at: Date;
	revoked_at: Date | null;
}

/** One token by id, or null when it does not exist (any more). */
export async function getTokenState(db: Pool, tokenId: string): Promise<TokenState | null> {
	const result = await db.query<TokenState>(
		'select id, user_id, name, workspace_ids, expires_at, revoked_at from public.ai_access_tokens where id = $1::uuid limit 1',
		[tokenId],
	);
	return result.rows[0] ?? null;
}

/** The tokens of a user, the newest first. The hash is not among them. */
export async function listTokens(db: Pool, userId: string): Promise<TokenRow[]> {
	const result = await db.query<TokenRow>(
		`select ${LIST_COLUMNS} from public.ai_access_tokens
		 where user_id = $1::uuid
		 order by created_at desc, id desc`,
		[userId],
	);
	return result.rows;
}
