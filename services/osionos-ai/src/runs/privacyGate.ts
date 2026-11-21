import type { ToolSet } from 'ai';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import type { AccountContext } from './account.ts';
import type { HistoryMessage, RunView } from './prompt.ts';

/**
 * FA26: a run on a may-train target sends no page context, workspace
 * retrieval, attachments or memories, in this turn or in replayed turns.
 * The route refuses what the body carries; the runner skips what it would
 * load; only the user's own turns are replayed (R37).
 */

/** The fields of the run body the gate reads. */
interface GatedBody {
	attachments?: readonly unknown[];
	context?: { pageIds?: readonly string[]; workspace?: boolean };
}

/** FA24: only an explicit no-train is private; anything else may train. */
export function isMayTrain(target: Pick<ResolvedTarget, 'dataUse'>): boolean {
	return target.dataUse !== 'no-train';
}

/**
 * The refusal code of a body that sends workspace data to a may-train target.
 *
 * Caveat: it reads the body fields only. The open view (`context.view`) names
 * page titles and is not refused; the conversation's workspace id is not a
 * body field and the runner skips its loading instead.
 */
export function mayTrainRefusal(body: GatedBody, target: Pick<ResolvedTarget, 'dataUse'>): 'may_train_context' | null {
	if (!isMayTrain(target)) return null;
	const carries =
		(body.context?.pageIds?.length ?? 0) > 0 || (body.attachments?.length ?? 0) > 0 || body.context?.workspace === true;
	return carries ? 'may_train_context' : null;
}

/**
 * The mark on the text part of an approval continuation's user turn: the turn
 * is stored as role 'user', but the service wrote it (tool output, page and
 * plan titles), not the user.
 */
export const CONTINUATION_MARK = { continuation: true } as const;

/** Whether stored parts carry {@link CONTINUATION_MARK}. */
export function isContinuationParts(parts: unknown): boolean {
	return Array.isArray(parts) && parts.some((part) => (part as { continuation?: unknown } | null)?.continuation === true);
}

/**
 * Caveat: rows written before the mark are known by the opening of
 * `continuationText` only. A typed message that opens the same way is dropped
 * too (over-drop, the safe side); a reworded continuation text is caught only
 * by the mark.
 */
const UNMARKED_CONTINUATION = /^the user (approved|declined) /;

/**
 * R37: the replayed turns of a may-train run are the user's own typed turns.
 * An earlier answer may paraphrase private pages in plain prose, which no
 * pattern can tell from any other prose, so no answer is replayed; nor is an
 * approval continuation, which carries tool output and titles.
 */
export function typedTurnsOnly(history: readonly HistoryMessage[]): HistoryMessage[] {
	return history.filter(
		(message) => message.role === 'user' && message.continuation !== true && !UNMARKED_CONTINUATION.test(message.text),
	);
}

/** The tools a may-train run keeps: the web ones, which read no workspace. */
export function webToolsOnly(tools: ToolSet | undefined): ToolSet | undefined {
	if (!tools) return undefined;
	const kept = Object.entries(tools).filter(([name]) => name.startsWith('web_'));
	return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/** R15: the open pages and tabs are private titles; route, layout and panel stay. */
export function viewWithoutPages(view: RunView): RunView {
	const { activePage: _activePage, tabs: _tabs, ...rest } = view;
	return rest;
}

/** R15: the workspace name is workspace data; the rest of the account stays. */
export function accountWithoutWorkspace(account: AccountContext): AccountContext {
	return { ...account, workspaceName: null };
}
