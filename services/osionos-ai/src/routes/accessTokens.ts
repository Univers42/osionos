import { z } from 'zod';
import { config } from '../config.ts';
import type { AuthUser } from '../auth.ts';
import { readJson, sendError, sendJson, sendNoContent } from '../http.ts';
import { checkPatRateLimit } from '../rateLimit.ts';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { createToken, listTokens, revokeToken } from '../pat/repo.ts';
import type { NewToken, TokenRow } from '../pat/repo.ts';
import { hashToken, last4, mintToken } from '../pat/token.ts';
import { isFreshSession, requireUser, UUID } from './support.ts';
import type { RouteContext } from './types.ts';

/**
 * The personal access tokens: minting one, listing them, revoking one.
 *
 * A PAT is a credential of its own — it is minted from a FRESH session (C113),
 * it is shown ONCE, and the database holds only its hash (C112). It opens
 * nothing yet: `authenticate()` still accepts app sessions only, so a PAT on
 * any other route is a 401 by construction (C114).
 */

/**
 * How fresh a session must be to mint a token: ten minutes.
 *
 * A stolen app session is worth an hour, and a PAT minted from it is worth
 * months — so the mint asks for a human who has just signed in (C113). A
 * session older than this is refused with `reauth_required`.
 */
const MINT_WINDOW_MS = 10 * 60 * 1000;

/** The mints of a user in a minute: a credential is not a cursor. */
const MINTS_PER_MINUTE = 5;

/** A day, in milliseconds: the expiry of a token is counted in days. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The body of a mint.
 *
 * Strict: a body that carries more than these four fields is a body that
 * tries to be an argument.
 */
const createSchema = z
	.object({
		name: z
			.string()
			.max(64)
			.refine((value) => value.trim().length > 0, 'name must not be blank'),
		scopes: z.array(z.enum(['read', 'write_approval'])).min(1).max(2),
		workspaceIds: z.array(z.string().regex(UUID)).min(1).max(50),
		expiresInDays: z.number().int().min(1).max(365).default(30),
	})
	.strict();

/** The token of the settings list, in the shape the browser reads. */
function toContractToken(row: TokenRow): Record<string, unknown> {
	return {
		id: row.id,
		name: row.name,
		last4: row.last4,
		scopes: row.scopes,
		workspaceIds: row.workspace_ids,
		createdAt: row.created_at.toISOString(),
		expiresAt: row.expires_at.toISOString(),
		lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
		revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
	};
}

/**
 * The refusal of the database when the user already holds twenty live
 * tokens: the SQLSTATE 54000 of the function.
 */
function isTooManyTokens(error: unknown): boolean {
	return (error as { code?: unknown } | null)?.code === '54000';
}

/** GET /api/ai/access-tokens */
async function handleListTokens(ctx: RouteContext, user: AuthUser): Promise<number> {
	const rows = await listTokens(ctx.deps.db, user.userId);
	const status = 200;
	sendJson(ctx.response, status, { tokens: rows.map(toContractToken) });
	return status;
}

/** A refused mint: the status and the error code the browser reads. */
interface Refusal {
	status: number;
	code: string;
}

function sendRefusal(ctx: RouteContext, refusal: Refusal): number {
	sendError(ctx.response, refusal.status, refusal.code);
	return refusal.status;
}

/** Why this caller may not mint right now, or null. */
async function callerRefusal(ctx: RouteContext, user: AuthUser): Promise<Refusal | null> {
	// A mint needs a fresh human (C113). A session that has been open for
	// hours is not one.
	if (!isFreshSession(user, MINT_WINDOW_MS)) return { status: 403, code: 'reauth_required' };
	const rate = await checkPatRateLimit(ctx.deps.redis, user.userId, MINTS_PER_MINUTE);
	return rate.allowed ? null : { status: 429, code: 'rate_limited' };
}

/** Why the asked scope may not be minted, or null. */
async function scopeRefusal(ctx: RouteContext, user: AuthUser, scopes: string[], workspaceIds: string[]): Promise<Refusal | null> {
	// Public mode mints read-only tokens until a live approve-and-deny e2e of an
	// MCP proposal exists (FB8).
	if (config.publicMode && scopes.includes('write_approval')) return { status: 400, code: 'scope_not_allowed' };
	// The workspaces of the caller, LIVE (C115): a membership that ended
	// ends the scope of the token at once.
	const live = await liveMemberWorkspaces(ctx.deps.db, user);
	return workspaceIds.some((id) => !live.includes(id)) ? { status: 403, code: 'workspace_forbidden' } : null;
}

/** The id of the new token row, or null when the user is at the cap. */
async function insertToken(ctx: RouteContext, token: NewToken): Promise<string | null> {
	try {
		return await createToken(ctx.deps.db, token);
	} catch (error) {
		// Twenty live tokens is the cap of the database: the mint is refused
		// with 429, and the user revokes one to make room.
		if (isTooManyTokens(error)) return null;
		throw error;
	}
}

/**
 * POST /api/ai/access-tokens
 *
 * The answer is the ONLY place the token appears. It is not stored, it is not
 * logged, and the list never carries it (C112).
 */
async function handleCreateToken(ctx: RouteContext, user: AuthUser): Promise<number> {
	const callerRefused = await callerRefusal(ctx, user);
	if (callerRefused) return sendRefusal(ctx, callerRefused);
	const body = await readJson(ctx.request, createSchema);
	const scopes = [...new Set(body.scopes)];
	const workspaceIds = [...new Set(body.workspaceIds)];
	const scopeRefused = await scopeRefusal(ctx, user, scopes, workspaceIds);
	if (scopeRefused) return sendRefusal(ctx, scopeRefused);
	const name = body.name.trim();
	const token = mintToken();
	const expiresAt = new Date(Date.now() + body.expiresInDays * DAY_MS);
	const row = { userId: user.userId, name, tokenSha256: hashToken(token), last4: last4(token), scopes, workspaceIds, expiresAt };
	const id = await insertToken(ctx, row);
	if (id === null) return sendRefusal(ctx, { status: 429, code: 'too_many_tokens' });
	// The log carries the id of the token: never the token, never its hash
	// (C112).
	console.info(JSON.stringify({ event: 'access_token_created', tokenId: id }));
	sendJson(ctx.response, 201, { id, token, name, last4: last4(token), scopes, workspaceIds, expiresAt: expiresAt.toISOString() });
	return 201;
}

/** GET and POST /api/ai/access-tokens */
export async function handleAccessTokens(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	if (ctx.request.method === 'POST') return handleCreateToken(ctx, user);
	if (ctx.request.method === 'GET') return handleListTokens(ctx, user);
	sendError(ctx.response, 405, 'method_not_allowed');
	return 405;
}

/**
 * DELETE /api/ai/access-tokens/:id
 *
 * A token of somebody else, or one that was already revoked, is a 404: the
 * caller hears nothing about tokens that are not theirs.
 */
export async function handleAccessTokenDelete(ctx: RouteContext): Promise<number> {
	const user = requireUser(ctx);
	if (!user) return 401;
	const id = ctx.params[0] ?? '';
	if (!UUID.test(id)) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const revoked = await revokeToken(ctx.deps.db, user.userId, id);
	if (!revoked) {
		sendError(ctx.response, 404, 'not_found');
		return 404;
	}
	const status = 204;
	sendNoContent(ctx.response);
	return status;
}
