import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { config } from '../config.ts';
import { resolveTarget } from '../gateway/resolve.ts';
import { startRun } from '../runs/runner.ts';
import { getRun } from '../runs/repo.ts';
import { getOwnedConversation } from '../conversations/repo.ts';
import { bridgeWrite, refusalMessage } from './bridge.ts';
import type { BridgeWrite } from './bridge.ts';
import { claimApproval, getOwnedApproval, recordOutcome } from './repo.ts';
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
			status: 'executed' | 'failed' | 'declined';
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
 * The continuation of a decided approval: a NEW run in the same conversation.
 *
 * It is a new run, with its own reservation and its own row: the run that
 * asked is over, and the one that continues counts against the cap of the day
 * like any other.
 */
async function continueRun(
	db: Pool,
	redis: Redis,
	user: AuthUser,
	row: ApprovalRow,
	outcome: 'executed' | 'failed' | 'declined',
	detail = '',
): Promise<string | undefined> {
	const conversation = await getOwnedConversation(db, {
		id: row.conversation_id,
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
		conversationId: row.conversation_id,
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
}): Promise<DecisionOutcome> {
	const { db, redis, user, sessionToken, approvalId, decision } = input;
	const row = await getOwnedApproval(db, { id: approvalId, ownerId: user.userId });
	if (!row) return { kind: 'refused', status: 404, code: 'not_found' };
	if (row.status !== 'pending') return { kind: 'refused', status: 409, code: 'approval_not_pending' };
	if (row.expires_at.getTime() <= Date.now()) {
		await db.query(
			`update public.ai_approvals set status = 'expired', decided_at = now() where id = $1 and status = 'pending'`,
			[approvalId],
		);
		return { kind: 'refused', status: 409, code: 'approval_expired' };
	}

	if (decision === 'decline') {
		const declined = await claimApproval(db, { id: approvalId, ownerId: user.userId, next: 'declined' });
		if (!declined) return { kind: 'refused', status: 409, code: 'approval_not_pending' };
		const continuationRunId = await continueRun(db, redis, user, declined, 'declined');
		return { kind: 'decided', status: 'declined', approval: declined, continuationRunId };
	}

	const claimed = await claimApproval(db, { id: approvalId, ownerId: user.userId, next: 'executing' });
	if (!claimed) return { kind: 'refused', status: 409, code: 'approval_not_pending' };

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
