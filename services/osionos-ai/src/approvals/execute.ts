import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { config } from '../config.ts';
import { approvalToolNames, hookRefusal } from '../context/hooks.ts';
import { checkDailyBuildLimit } from '../rateLimit.ts';
import { claimApproval } from './claim.ts';
import { expireApproval, getOwnedApproval, recordOutcome } from './repo.ts';
import { getTokenState } from '../pat/repo.ts';
import { revalidateStoredPlan, flattenPlan } from '../builders/plan.ts';
import { approvedKeys, executePlan } from '../builders/execute.ts';
import { seedItems, setItem } from '../builders/items.ts';
import type { AuthUser } from '../auth.ts';
import type { ApprovalRow } from './types.ts';
import { runApprovedMcpCall } from '../mcpClient/decide.ts';
import { applyClaimed } from './apply.ts';
import { continueRun } from './continuation.ts';
import { makeRunCredential } from '../modes/credential.ts';

export { bridgeWriteOf } from './apply.ts';
export { appendOutcome } from './applyAppend.ts';
export { continuationText } from './continuation.ts';

/**
 * The decision of an approval: the one moment a write happens.
 *
 * The order is the one that matters:
 *
 * 1. the CLAIM moves the row out of 'pending' — once, and only once, so two
 *    decisions that race write ONCE;
 * 2. the WRITE (`applyClaimed`) goes out with the token of THIS request — the
 *    token is never stored, and it never reaches a tool, an event or a row —
 *    and the OUTCOME is recorded before anything else happens, so a run that
 *    goes on knows what the write did;
 * 3. the CONTINUATION starts, in the same conversation, with its own
 *    reservation: the run that asked is over, and a new one carries the news.
 */

/** What a decision ends with. */
export type DecisionOutcome =
	| {
			kind: 'decided';
			status: 'executed' | 'failed' | 'declined' | 'partial' | 'unknown';
			approval: ApprovalRow;
			result?: unknown;
			continuationRunId?: string;
	  }
	| { kind: 'refused'; status: number; code: string };

interface Decision {
	db: Pool;
	redis: Redis;
	user: AuthUser;
	sessionToken: string;
	approvalId: string;
	decision: 'approve' | 'decline';
	items?: string[];
}

/**
 * Whether the token of an MCP approval may still be honoured.
 *
 * The scope and the revocation are re-checked at DECISION time, not trusted
 * from the moment the agent asked (C115, C117): a revoked token, an expired
 * one, a token that is gone, or a workspace taken out of its scope all mean
 * the same thing — the question died with the credential, and nothing is
 * written.
 */
async function mcpTokenCovers(db: Pool, row: ApprovalRow): Promise<boolean> {
	if (!row.token_id) return false;
	const token = await getTokenState(db, row.token_id);
	if (!token) return false;
	if (String(token.user_id) !== row.owner_id) return false;
	if (token.revoked_at) return false;
	if (token.expires_at.getTime() <= Date.now()) return false;
	return token.workspace_ids.map(String).includes(row.workspace_id);
}

/** An approval nobody answered in time is not decided at all: it expires. */
async function expireRow(db: Pool, id: string): Promise<DecisionOutcome> {
	await db.query(
		`update public.ai_approvals set status = 'expired', decided_at = now() where id = $1 and status = 'pending'`,
		[id],
	);
	return { kind: 'refused', status: 409, code: 'approval_expired' };
}

/** Whether the items name a step the stored plan does not have. */
function hasUnknownItem(row: ApprovalRow, items: string[]): boolean {
	const rv = revalidateStoredPlan(row.args);
	if (!rv.ok) return false;
	const keys = new Set(flattenPlan(rv.plan).map((f) => f.key));
	return items.some((key) => !keys.has(key));
}

/** The refusals that need no claim: the row stays as it is. */
async function refusalBeforeClaim(input: Decision, row: ApprovalRow): Promise<DecisionOutcome | null> {
	const { db, decision, items } = input;
	if (items && items.length > 0 && row.tool !== 'build_plan') {
		return { kind: 'refused', status: 400, code: 'items_not_allowed' };
	}
	if (row.status !== 'pending') return { kind: 'refused', status: 409, code: 'approval_not_pending' };
	if (row.expires_at.getTime() <= Date.now()) return expireRow(db, row.id);
	// An MCP approval is decided against the token LIVE: a revoked or expired
	// token, or a workspace taken out of its scope, kills the question before
	// the claim, and nothing is written (C114, C115, C117). A decline needs no
	// token: saying no never writes.
	if (decision === 'approve' && row.origin === 'mcp' && !(await mcpTokenCovers(db, row))) {
		await expireApproval(db, row.id);
		return { kind: 'refused', status: 409, code: 'approval_expired' };
	}
	if (row.tool === 'build_plan' && items && items.length > 0 && hasUnknownItem(row, items)) {
		return { kind: 'refused', status: 400, code: 'unknown_item' };
	}
	return null;
}

/** The refusals of an approve that come before the claim: a hook, the day's builder bucket. */
async function approveRefusal({ db, redis, user }: Decision, row: ApprovalRow): Promise<DecisionOutcome | null> {
	// U3: a hook written after the card refuses the approve BEFORE the claim
	// (C1125, C1126): the row stays pending, nothing is written, and a read
	// that fails is a 503, never a pass. A decline never reads hooks.
	const refusal = await hookRefusal(db, user.userId, approvalToolNames(row));
	if (refusal) return { kind: 'refused', ...refusal };
	// A builder pass spends the day's bucket BEFORE the claim (C161): at the
	// limit the approval stays 'pending', and no write has started.
	if (row.tool !== 'build_plan') return null;
	const daily = await checkDailyBuildLimit(redis, user.userId, config.buildsPerDay);
	return daily.allowed ? null : { kind: 'refused', status: 429, code: 'build_limit_reached' };
}

/** The credential of the decide request, for the continuation it starts (AM1): never stored. */
function credentialOf({ sessionToken, user }: Decision) {
	return makeRunCredential(sessionToken, user.expiresAtMs);
}

/** A failed outcome of an already-recorded row, continued. */
async function failedDecision(input: Decision, claimed: ApprovalRow, error: string): Promise<DecisionOutcome> {
	const continuationRunId = await continueRun(input.db, input.redis, input.user, claimed, 'failed', error, credentialOf(input));
	return { kind: 'decided', status: 'failed', approval: claimed, continuationRunId };
}

/** Seeds the plan's items and skips the ones the user did not approve. */
async function seedAndSkip(db: Pool, approvalId: string, flat: ReturnType<typeof flattenPlan>, approved: string[]) {
	await seedItems(db, approvalId, flat);
	const approvedSet = new Set(approved);
	for (const f of flat) {
		if (!approvedSet.has(f.key)) await setItem(db, approvalId, f.key, 'skipped');
	}
}

/** The keys to build, or null when the items are not the plan's (validated before the claim; should not happen). */
function approvedOrNull(flat: ReturnType<typeof flattenPlan>, items?: string[]): string[] | null {
	try {
		return approvedKeys(flat, items);
	} catch {
		return null;
	}
}

async function decideBuildPlan(input: Decision, claimed: ApprovalRow): Promise<DecisionOutcome> {
	const { db, redis, user, sessionToken, items } = input;
	const rv = revalidateStoredPlan(claimed.args);
	const flat = rv.ok ? flattenPlan(rv.plan) : [];
	const approved = rv.ok ? approvedOrNull(flat, items) : null;
	if (!rv.ok || !approved) {
		const error = rv.ok ? 'unknown_item' : rv.error;
		await recordOutcome(db, { id: claimed.id, status: 'failed', error });
		return failedDecision(input, claimed, error);
	}
	await seedAndSkip(db, claimed.id, flat, approved);
	const execResult = await executePlan({ db, user, sessionToken, approval: claimed, plan: rv.plan, budgetMs: config.buildBudgetMs });
	const c = execResult.counts;
	const status = c.pending > 0 ? 'partial' : c.done === 0 ? 'failed' : 'executed';
	const result = { ...c, created: execResult.created, counts: c };
	await recordOutcome(db, { id: claimed.id, status, result });
	const detail = `the plan "${rv.plan.title}" was built: ${c.done} created, ${c.failed} failed, ${c.pending} left to resume`;
	const continuationRunId = await continueRun(db, redis, user, claimed, status === 'failed' ? 'failed' : 'executed', detail, credentialOf(input));
	return { kind: 'decided', status, approval: claimed, result, continuationRunId };
}

async function decideMcpCall(input: Decision, claimed: ApprovalRow): Promise<DecisionOutcome> {
	const { db, redis, user } = input;
	const done = await runApprovedMcpCall(db, claimed);
	if (!done.ok) {
		await recordOutcome(db, { id: claimed.id, status: 'failed', error: done.error });
		return failedDecision(input, claimed, done.error);
	}
	// The row keeps a summary, never the output: the output is data of one run.
	const result = { ok: true, summary: done.summary };
	await recordOutcome(db, { id: claimed.id, status: 'executed', result });
	const continuationRunId = await continueRun(db, redis, user, claimed, 'executed', done.detail, credentialOf(input));
	return { kind: 'decided', status: 'executed', approval: claimed, result, continuationRunId };
}

async function decideWrite(input: Decision, claimed: ApprovalRow): Promise<DecisionOutcome> {
	const { db, redis, user, sessionToken } = input;
	const applied = await applyClaimed({ db, bridgeUrl: config.bridgeUrl ?? '', token: sessionToken }, claimed);
	if (applied.status !== 'executed') {
		const continuationRunId = await continueRun(db, redis, user, claimed, 'failed', applied.error, credentialOf(input));
		return { kind: 'decided', status: applied.status, approval: claimed, continuationRunId };
	}
	const continuationRunId = await continueRun(db, redis, user, claimed, 'executed', applied.detail, credentialOf(input));
	return { kind: 'decided', status: 'executed', approval: claimed, result: applied.recorded, continuationRunId };
}

/**
 * The decision of an approval.
 *
 * The caller must be the owner: a foreign approval does not exist for them.
 */
export async function decideApproval(input: Decision): Promise<DecisionOutcome> {
	const { db, redis, user, approvalId, decision } = input;
	const row = await getOwnedApproval(db, { id: approvalId, ownerId: user.userId });
	if (!row) return { kind: 'refused', status: 404, code: 'not_found' };
	const early = await refusalBeforeClaim(input, row);
	if (early) return early;

	if (decision === 'decline') {
		const declined = await claimApproval(db, { id: approvalId, ownerId: user.userId, next: 'declined', decidedBy: 'user' });
		if (!declined) return { kind: 'refused', status: 409, code: 'approval_not_pending' };
		const continuationRunId = await continueRun(db, redis, user, declined, 'declined', '', credentialOf(input));
		return { kind: 'decided', status: 'declined', approval: declined, continuationRunId };
	}

	const refusal = await approveRefusal(input, row);
	if (refusal) return refusal;
	const claimed = await claimApproval(db, { id: approvalId, ownerId: user.userId, next: 'executing', decidedBy: 'user' });
	if (!claimed) return { kind: 'refused', status: 409, code: 'approval_not_pending' };
	if (claimed.tool === 'build_plan') return decideBuildPlan(input, claimed);
	if (claimed.tool === 'mcp_call') return decideMcpCall(input, claimed);
	return decideWrite(input, claimed);
}
