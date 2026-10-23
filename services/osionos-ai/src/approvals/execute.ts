import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { config } from '../config.ts';
import { checkDailyBuildLimit } from '../rateLimit.ts';
import { resolveTarget } from '../gateway/resolve.ts';
import { startRun } from '../runs/runner.ts';
import { getRun } from '../runs/repo.ts';
import { getOwnedConversation } from '../conversations/repo.ts';
import { bridgeWrite, refusalMessage } from './bridge.ts';
import type { BridgeWrite } from './bridge.ts';
import { claimApproval, expireApproval, getOwnedApproval, recordOutcome, claimPartial } from './repo.ts';
import { getTokenState } from '../pat/repo.ts';
import { revalidateStoredPlan, flattenPlan } from '../builders/plan.ts';
import { approvedKeys, executePlan, writeOf } from '../builders/execute.ts';
import { seedItems, setItem } from '../builders/items.ts';
import { WRITE_VERBS } from '../tools/writeTools.ts';
import type { AuthUser } from '../auth.ts';
import type { ApprovalRow } from './types.ts';

/**
 * The decision of an approval: the one moment a write happens.
 *
 * The order is the one that matters:
 *
 * 1. the CLAIM moves the row out of 'pending' — once, and only once, so two
 *    decisions that race write ONCE;
 * 2. the WRITE goes out with the token of THIS request — the token is never
 *    stored, and it never reaches a tool, an event or a row;
 * 3. the OUTCOME is recorded — before anything else happens, so a run that
 *    goes on knows what the write did;
 * 4. the CONTINUATION starts, in the same conversation, with its own
 *    reservation: the run that asked is over, and a new one carries the news.
 */

/** The shape of a uuid: the ids that are not uuids can never be one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a decision ends with. */
export type DecisionOutcome =
	| {
			kind: 'decided';
			status: 'executed' | 'failed' | 'declined' | 'partial';
			approval: ApprovalRow;
			result?: unknown;
			continuationRunId?: string;
	  }
	| { kind: 'refused'; status: number; code: string };

/**
 * The write the bridge is asked for, rebuilt from the stored arguments.
 *
 * The body is a WHITELIST, one more time: the stored arguments are already
 * stripped, and the body is built from the fields the tool owns. So
 * `visibility`, `collaborators`, `properties` and a `workspaceId` of a page
 * that exists never reach the bridge, and `archivedAt` is STAMPED HERE — it is
 * never an argument of the model.
 *
 * There is no DELETE in this function, and there never will be: the archive
 * is a stamp, and a stamp can be taken away.
 */
export function bridgeWriteOf(row: ApprovalRow): BridgeWrite | null {
	const args = row.args ?? {};
	// build_plan has no execution until P6a-3: null makes the decision fail
	// without a bridge call.
	if (row.tool === 'build_plan') return null;
	const pageId = typeof args.pageId === 'string' ? args.pageId : '';
	if (row.tool === 'create_page') {
		const workspaceId = typeof args.workspaceId === 'string' ? args.workspaceId : '';
		const title = typeof args.title === 'string' ? args.title : '';
		if (!UUID.test(workspaceId)) return null;
		return {
			method: 'POST',
			path: '/api/pages',
			body: {
				workspaceId,
				title,
				...(typeof args.parentPageId === 'string' ? { parentPageId: args.parentPageId } : {}),
				...(Array.isArray(args.content) ? { content: args.content } : {}),
			},
		};
	}
	if (row.tool === 'rename_page') {
		const title = typeof args.title === 'string' ? args.title : '';
		if (!UUID.test(pageId)) return null;
		return { method: 'PATCH', path: `/api/pages/${pageId}`, body: { title } };
	}
	if (row.tool === 'archive_page') {
		if (!UUID.test(pageId)) return null;
		return {
			method: 'PATCH',
			path: `/api/pages/${pageId}`,
			body: { archivedAt: new Date().toISOString() },
		};
	}
	return null;
}

/** The sentence the continuation carries: what the user decided, and what happened. */
export function continuationText(row: ApprovalRow, outcome: string, detail = ''): string {
	const verb = WRITE_VERBS[row.tool] ?? row.tool;
	if (outcome === 'declined') return `the user declined ${row.tool} (${verb})`;
	return `the user approved ${row.tool} (${verb}), result: ${detail}`;
}

/** The short result of a write: what the user is told, and what the row holds. */
function successSummary(row: ApprovalRow): string {
	const args = row.args ?? {};
	const title = typeof args.title === 'string' ? args.title : '';
	if (row.tool === 'create_page') return `the page "${title}" was created`;
	if (row.tool === 'rename_page') return `the page is now named "${title}"`;
	if (row.tool === 'archive_page') return 'the page was archived';
	return 'the write landed';
}

/** The page the bridge created, when it answers with one. */
function createdPage(body: string): { pageId?: string; title?: string } {
	try {
		const parsed = JSON.parse(body) as { _id?: unknown; id?: unknown; title?: unknown };
		const pageId = typeof parsed._id === 'string' ? parsed._id : typeof parsed.id === 'string' ? parsed.id : undefined;
		return {
			...(pageId ? { pageId } : {}),
			...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
		};
	} catch {
		return {};
	}
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

/**
 * The continuation of a decided approval: a NEW run in the same conversation.
 *
 * It is a new run, with its own reservation and its own row: the run that
 * asked is over, and the one that continues counts against the cap of the day
 * like any other.
 *
 * An MCP approval has NO continuation: there is no conversation to go on in,
 * and the agent that asked is not waiting on a stream. Its decision is a row,
 * and the next call of the agent reads the workspace.
 */
async function continueRun(
	db: Pool,
	redis: Redis,
	user: AuthUser,
	row: ApprovalRow,
	outcome: 'executed' | 'failed' | 'declined',
	detail = '',
): Promise<string | undefined> {
	if (row.origin !== 'run') return undefined;
	if (!row.conversation_id || !row.run_id) return undefined;
	const conversationId = row.conversation_id;
	const conversation = await getOwnedConversation(db, {
		id: conversationId,
		ownerId: row.owner_id,
	});
	if (!conversation) return undefined;
	// The model of the continuation is the model of the run that asked: the
	// answer goes on in the same voice.
	const run = await getRun(db, row.run_id);
	const model = run?.model ?? conversation.model ?? undefined;
	const resolved = await resolveTarget(db, redis, user, undefined, model);
	if (resolved.kind === 'refused') return undefined;
	const started = await startRun({
		db,
		redis,
		runId: randomUUID(),
		conversationId,
		ownerId: row.owner_id,
		text: continuationText(row, outcome, detail),
		target: resolved.target,
		user,
		emit: () => {},
	});
	if (started.kind !== 'started') return undefined;
	// The continuation runs on its own: the request that decided answers with
	// the outcome, and the run is followed through its own events.
	void started.execute().catch((error: Error) => {
		console.warn(JSON.stringify({ event: 'continuation_failed', code: error.name }));
	});
	return started.run.id;
}

/**
 * The decision of an approval.
 *
 * The caller must be the owner: a foreign approval does not exist for them.
 */
export async function decideApproval(input: {
	db: Pool;
	redis: Redis;
	user: AuthUser;
	sessionToken: string;
	approvalId: string;
	decision: 'approve' | 'decline';
	items?: string[];
}): Promise<DecisionOutcome> {
	const { db, redis, user, sessionToken, approvalId, decision, items } = input;
	const row = await getOwnedApproval(db, { id: approvalId, ownerId: user.userId });
	if (!row) return { kind: 'refused', status: 404, code: 'not_found' };
	if (items && items.length > 0 && row.tool !== 'build_plan') {
		return { kind: 'refused', status: 400, code: 'items_not_allowed' };
	}
	if (row.status !== 'pending') return { kind: 'refused', status: 409, code: 'approval_not_pending' };
	if (row.expires_at.getTime() <= Date.now()) {
		await db.query(
			`update public.ai_approvals set status = 'expired', decided_at = now() where id = $1 and status = 'pending'`,
			[approvalId],
		);
		return { kind: 'refused', status: 409, code: 'approval_expired' };
	}

	// An MCP approval is decided against the token LIVE: a revoked or expired
	// token, or a workspace taken out of its scope, kills the question before
	// the claim, and nothing is written (C114, C115, C117). A decline needs no
	// token: saying no never writes.
	if (decision === 'approve' && row.origin === 'mcp' && !(await mcpTokenCovers(db, row))) {
		await expireApproval(db, row.id);
		return { kind: 'refused', status: 409, code: 'approval_expired' };
	}

	if (row.tool === 'build_plan' && items && items.length > 0) {
		const rv = revalidateStoredPlan(row.args);
		if (rv.ok) {
			const keys = new Set(flattenPlan(rv.plan).map((f) => f.key));
			if (items.some((key) => !keys.has(key))) {
				return { kind: 'refused', status: 400, code: 'unknown_item' };
			}
		}
	}

	if (decision === 'decline') {
		const declined = await claimApproval(db, { id: approvalId, ownerId: user.userId, next: 'declined' });
		if (!declined) return { kind: 'refused', status: 409, code: 'approval_not_pending' };
		const continuationRunId = await continueRun(db, redis, user, declined, 'declined');
		return { kind: 'decided', status: 'declined', approval: declined, continuationRunId };
	}

	// A builder pass spends the day's bucket BEFORE the claim (C161): at the
	// limit the approval stays 'pending', and no write has started. A decline
	// never reaches here, and never spends a pass.
	if (row.tool === 'build_plan') {
		const daily = await checkDailyBuildLimit(redis, user.userId, config.buildsPerDay);
		if (!daily.allowed) return { kind: 'refused', status: 429, code: 'build_limit_reached' };
	}

	const claimed = await claimApproval(db, { id: approvalId, ownerId: user.userId, next: 'executing' });
	if (!claimed) return { kind: 'refused', status: 409, code: 'approval_not_pending' };

	if (claimed.tool === 'build_plan') {
		const rv = revalidateStoredPlan(claimed.args);
		if (!rv.ok) {
			await recordOutcome(db, { id: claimed.id, status: 'failed', error: rv.error });
			const continuationRunId = await continueRun(db, redis, user, claimed, 'failed', rv.error);
			return { kind: 'decided', status: 'failed', approval: claimed, continuationRunId };
		}
		const plan = rv.plan;
		const flat = flattenPlan(plan);
		let approved: string[];
		try {
			approved = approvedKeys(flat, items);
		} catch {
			// Should not happen: validated above. Treat as failed without bridge.
			const error = 'unknown_item';
			await recordOutcome(db, { id: claimed.id, status: 'failed', error });
			const continuationRunId = await continueRun(db, redis, user, claimed, 'failed', error);
			return { kind: 'decided', status: 'failed', approval: claimed, continuationRunId };
		}
		await seedItems(db, claimed.id, flat);
		const approvedSet = new Set(approved);
		for (const f of flat) {
			if (!approvedSet.has(f.key)) await setItem(db, claimed.id, f.key, 'skipped');
		}
		const execResult = await executePlan({
			db,
			user,
			sessionToken,
			approval: claimed,
			plan,
			budgetMs: config.buildBudgetMs,
		});
		const c = execResult.counts;
		let status: 'partial' | 'failed' | 'executed';
		if (c.pending > 0) status = 'partial';
		else if (c.done === 0) status = 'failed';
		else status = 'executed';
		const result = { ...c, created: execResult.created, counts: c };
		await recordOutcome(db, { id: claimed.id, status, result });
		const detail = `the plan "${plan.title}" was built: ${c.done} created, ${c.failed} failed, ${c.pending} left to resume`;
		const continuationOutcome = status === 'failed' ? 'failed' : 'executed';
		const continuationRunId = await continueRun(db, redis, user, claimed, continuationOutcome, detail);
		return { kind: 'decided', status, approval: claimed, result, continuationRunId };
	}

	const write = bridgeWriteOf(claimed);
	const bridgeUrl = config.bridgeUrl;
	if (!write || !bridgeUrl) {
		const error = 'the write cannot be sent: the bridge is not configured';
		await recordOutcome(db, { id: claimed.id, status: 'failed', error });
		const continuationRunId = await continueRun(db, redis, user, claimed, 'failed', error);
		return { kind: 'decided', status: 'failed', approval: claimed, continuationRunId };
	}

	const answer = await bridgeWrite({ url: bridgeUrl, token: sessionToken, write });
	if (!answer.ok) {
		const error = refusalMessage(answer);
		await recordOutcome(db, { id: claimed.id, status: 'failed', error });
		const continuationRunId = await continueRun(db, redis, user, claimed, 'failed', error);
		return { kind: 'decided', status: 'failed', approval: claimed, continuationRunId };
	}

	const result = { ok: true, ...createdPage(answer.body) };
	await recordOutcome(db, { id: claimed.id, status: 'executed', result });
	const continuationRunId = await continueRun(db, redis, user, claimed, 'executed', successSummary(claimed));
	return { kind: 'decided', status: 'executed', approval: claimed, result, continuationRunId };
}
