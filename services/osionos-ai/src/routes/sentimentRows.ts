import type { ServerResponse } from 'node:http';
import { config } from '../config.ts';
import { sendError } from '../http.ts';
import { canReadPageRowAsMember } from '../../../../scripts/bridge-page-read.mjs';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { requireUser } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The per-row read surface of AI sentiment on object databases (M6p-1).
 *
 * C154: a projection row is owner-only (object databases are owner-only), so
 * the answer is `{rowId: label}` for the rows the caller may read and `{}`
 * for everything else. An unknown database, a workspace that is off, a
 * non-member, a stale score and a row without a score are byte-identical.
 *
 * The answer carries the label only: no confidence, model, revision, author,
 * timestamp or text (C140).
 */

const MAX_DATABASE_ID = 128;
const MAX_PROPERTY_ID = 80;

type RowLabel = {
	id: string;
	row_id: string;
	owner_id: string;
	workspace_id: string | null;
	visibility: string;
	collaborators: unknown;
	label: string;
};

/**
 * The score is fresh only while the projection still carries the text that
 * was scored (C142), and the workspace must still be opted in (C138).
 */
const ROWS_SQL = `
	select r.id, r.row_id, r.owner_id, r.workspace_id,
	       r.visibility, r.collaborators, s.label
	  from public.osionos_object_database_rows r
	  join public.ai_sentiment s
	    on s.subject_kind = 'database_row' and s.subject_id = r.id::text
	  join public.ai_sentiment_settings st
	    on st.workspace_id = r.workspace_id and st.enabled
	 where r.db_key = $1
	   and r.property_id = $2
	   and s.content_sha256 = encode(sha256(convert_to(r.scored_text, 'UTF8')), 'hex')`;

function sendPrivateJson(response: ServerResponse, body: unknown): void {
	response.writeHead(200, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'private, no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end(JSON.stringify(body));
}

/** GET /api/ai/sentiment/rows?databaseId=<dbKey>&propertyId=<propertyId> */
export async function handleSentimentRows(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;

	const databaseId = ctx.url.searchParams.get('databaseId') ?? '';
	const propertyId = ctx.url.searchParams.get('propertyId') ?? '';
	if (
		databaseId.length === 0 ||
		databaseId.length > MAX_DATABASE_ID ||
		propertyId.length === 0 ||
		propertyId.length > MAX_PROPERTY_ID
	) {
		sendError(ctx.response, 400, 'invalid_request');
		return 400;
	}

	const result = await ctx.deps.db.query<RowLabel>(ROWS_SQL, [databaseId, propertyId]);
	const workspaces = await liveMemberWorkspaces(ctx.deps.db, user);
	const out: Record<string, string> = {};
	for (const row of result.rows) {
		if (!canReadPageRowAsMember(row, user.userId, workspaces)) continue;
		out[row.row_id] = row.label;
	}
	sendPrivateJson(ctx.response, out);
	return 200;
}
