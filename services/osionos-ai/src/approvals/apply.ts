import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { CODE_LANGUAGE } from '../tools/blockTypes.ts';
import { bridgeWrite, holdsOutcome, refusalMessage } from './bridge.ts';
import type { BridgeWrite } from './bridge.ts';
import { recordOutcome } from './repo.ts';
import { applyAppend } from './applyAppend.ts';
import { readTitleBefore } from './inverseData.ts';
import type { AppliedResult } from './inverseData.ts';
import type { ApprovalRow } from './types.ts';

/**
 * The apply core: the one path every approved write goes through.
 *
 * `applyClaimed` takes a row ALREADY claimed (status 'executing'), sends the
 * write with the token it is given, and records the outcome — and what the
 * write did — on the row. The token is used for the bridge call and nowhere
 * else: no row, event, log line or `error` string carries it (AM1).
 */

export interface ApplyCall {
	db: Pool;
	bridgeUrl: string;
	token: string;
	/**
	 * An auto claim sets it: a 401 or 403 leaves the row 'executing' (nothing was
	 * written) so the caller can give the claim back and ask a human instead.
	 */
	holdOnAuthRefusal?: boolean;
}

/** The writes with nothing to undo from: they record that they landed, and the page. */
export interface PlainApplied {
	tool: 'update_page_settings' | 'archive_page';
	pageId: string;
}

export type Applied =
	| { status: 'executed'; result: AppliedResult | PlainApplied; recorded: Record<string, unknown>; detail: string }
	| { status: 'failed' | 'unknown'; error: string; httpStatus?: number };

/** The shape of a uuid: the ids that are not uuids can never be one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Args = Record<string, unknown>;
type WriteOf = (row: ApprovalRow, args: Args) => BridgeWrite | null;

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function createPageWrite(_row: ApprovalRow, args: Args): BridgeWrite | null {
	const workspaceId = str(args.workspaceId);
	if (!UUID.test(workspaceId)) return null;
	return {
		method: 'POST',
		path: '/api/pages',
		body: {
			workspaceId,
			title: str(args.title),
			...(typeof args.parentPageId === 'string' ? { parentPageId: args.parentPageId } : {}),
			...(Array.isArray(args.content) ? { content: args.content } : {}),
		},
	};
}

/** A PATCH of one page the write owns the body of, or null for an id that is not a page. */
function pagePatch(args: Args, suffix: string, body: () => Args): BridgeWrite | null {
	const pageId = str(args.pageId);
	if (!UUID.test(pageId)) return null;
	return { method: 'PATCH', path: `/api/pages/${pageId}${suffix}`, body: body() };
}

function addBlocksWrite(row: ApprovalRow, args: Args): BridgeWrite | null {
	const pageId = str(args.pageId);
	if (!UUID.test(pageId) || !Array.isArray(args.blocks)) return null;
	// The ids are minted here, per execution, never taken from the model (C235);
	// the approval id is the idempotency key, so a retry of this write lands once (C226).
	const blocks = args.blocks.map((block) => {
		const { type, content, language } = (block ?? {}) as { type?: unknown; content?: unknown; language?: unknown };
		const named = type === 'code' && typeof language === 'string' && CODE_LANGUAGE.test(language);
		return { id: randomUUID(), type: String(type ?? ''), content: String(content ?? ''), ...(named ? { language } : {}) };
	});
	const afterBlockId = typeof args.afterBlockId === 'string' ? { afterBlockId: args.afterBlockId } : {};
	return { method: 'POST', path: `/api/pages/${pageId}/blocks`, body: { blocks, ...afterBlockId, idempotencyKey: row.id } };
}

/**
 * The write per tool, rebuilt from the stored arguments. A tool with no entry
 * (build_plan, mcp_call) has no bridge write: null makes the apply fail
 * without a bridge call.
 *
 * The body is a WHITELIST, one more time: `visibility`, `collaborators`,
 * `properties` and a `workspaceId` of a page that exists never reach the
 * bridge, and `archivedAt` is STAMPED HERE — never an argument of the model.
 * There is no DELETE here, and there never will be: the archive is a stamp.
 */
const WRITES = new Map<string, WriteOf>([
	['create_page', createPageWrite],
	['rename_page', (_row, args) => pagePatch(args, '', () => ({ title: str(args.title) }))],
	['update_page_settings', (_row, args) => pagePatch(args, '/config', () => ({ config: args.settings, merge: true }))],
	['archive_page', (_row, args) => pagePatch(args, '', () => ({ archivedAt: new Date().toISOString() }))],
	['add_blocks', addBlocksWrite],
]);

export function bridgeWriteOf(row: ApprovalRow): BridgeWrite | null {
	return WRITES.get(row.tool)?.(row, row.args ?? {}) ?? null;
}

/** The short result of a write: what the user is told, and what the row holds. */
export function successSummary(row: ApprovalRow): string {
	const title = str(row.args?.title);
	if (row.tool === 'create_page') return `the page "${title}" was created`;
	if (row.tool === 'rename_page') return `the page is now named "${title}"`;
	if (row.tool === 'update_page_settings') return 'the page settings were changed';
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

/** What the write did, as the typed record and the row's result (the legacy keys stay). */
function executedOf(row: ApprovalRow, answerBody: string, previousTitle: string | null): Applied {
	const detail = successSummary(row);
	const legacy = createdPage(answerBody);
	const pageId = str(row.args.pageId);
	if (row.tool === 'rename_page') {
		const result = { tool: 'rename_page' as const, pageId, previousTitle, appliedTitle: str(row.args.title) };
		return { status: 'executed', result, recorded: { ok: true, ...legacy, ...result }, detail };
	}
	if (row.tool === 'create_page') {
		const result = {
			tool: 'create_page' as const,
			createdPageId: legacy.pageId ?? null,
			parentPageId: typeof row.args.parentPageId === 'string' ? row.args.parentPageId : null,
		};
		return { status: 'executed', result, recorded: { ok: true, ...legacy, ...result }, detail };
	}
	const result: PlainApplied = { tool: row.tool as PlainApplied['tool'], pageId };
	return { status: 'executed', result, recorded: { ok: true, ...legacy, ...result }, detail };
}

async function recordFailure(call: ApplyCall, row: ApprovalRow, error: string, httpStatus?: number): Promise<Applied> {
	if (!holdsOutcome(call, httpStatus)) await recordOutcome(call.db, { id: row.id, status: 'failed', error });
	return { status: 'failed', error, ...(httpStatus === undefined ? {} : { httpStatus }) };
}

/** Writes a claimed row's write to the bridge and records the outcome on the row. */
export async function applyClaimed(call: ApplyCall, row: ApprovalRow): Promise<Applied> {
	const write = bridgeWriteOf(row);
	if (!write || !call.bridgeUrl) {
		return recordFailure(call, row, 'the write cannot be sent: the bridge is not configured');
	}
	if (row.tool === 'add_blocks') return applyAppend(call, row, write);
	// A failed read is "no inverse recorded": the rename still goes out, undoable-less,
	// rather than throwing with the row left 'executing' and nothing sent.
	const previousTitle = row.tool === 'rename_page' ? await readTitleBefore(call.db, str(row.args.pageId)).catch(() => null) : null;
	const answer = await bridgeWrite({ url: call.bridgeUrl, token: call.token, write });
	if (!answer.ok) return recordFailure(call, row, refusalMessage(answer), answer.status);
	const done = executedOf(row, answer.body, previousTitle);
	if (done.status === 'executed') await recordOutcome(call.db, { id: row.id, status: 'executed', result: done.recorded });
	return done;
}
