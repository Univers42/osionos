import type { IncomingMessage } from 'node:http';
import type { Pool } from 'pg';
import { hashToken, hasTokenInQuery, parsePatBearer } from './token.ts';
import { resolveToken } from './repo.ts';

/**
 * The principal of a personal access token.
 *
 * A PAT is a credential of its own: it names its owner, what it may read and
 * where it may read it. It NEVER carries `isAdmin` (C114) — the flag of the
 * owner is not the flag of the token, and a token that carried it could
 * approve the writes it asks for.
 */
export interface PatPrincipal {
	/** The id of the token: the log may carry it, and nothing else. */
	tokenId: string;
	/** The user the token belongs to. */
	userId: string;
	/** The name the user gave the token. */
	name: string;
	/** What the token may do: `read`, `write_approval`, or both. */
	scopes: string[];
	/** The workspaces the token may reach. */
	workspaceIds: string[];
	/** ALWAYS false. A PAT is never an administrator (C114). */
	isAdmin: false;
}

/**
 * The principal of the PAT of a request, or null when there is none.
 *
 * The order of the refusals is the order of the rules:
 *   1. a token in the query string is refused, whatever the header says
 *      (C112): a URL is written down by the world;
 *   2. the header must be exactly `Bearer osn_pat_<43>`;
 *   3. the hash of the token is resolved, with NO cache (C116): a token
 *      revoked on one replica is refused on the next call of every one.
 *
 * Nothing here logs, and nothing here throws: a request without a PAT is a
 * request without a PAT.
 */
export async function authenticatePat(
	db: Pool,
	request: IncomingMessage,
): Promise<PatPrincipal | null> {
	if (hasTokenInQuery(request.url ?? '')) return null;
	const token = parsePatBearer(request.headers.authorization);
	if (!token) return null;
	const row = await resolveToken(db, hashToken(token));
	if (!row) return null;
	return {
		tokenId: String(row.token_id),
		userId: String(row.user_id),
		name: String(row.name),
		scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
		workspaceIds: Array.isArray(row.workspace_ids) ? row.workspace_ids.map(String) : [],
		isAdmin: false,
	};
}
