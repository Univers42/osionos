import type { ModelMessage, ToolSet } from 'ai';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import type { AccountContext } from './account.ts';
import type { RunView } from './prompt.ts';

/**
 * FA26: a run on a may-train target sends no page context, workspace
 * retrieval, attachments or memories, in this turn or in replayed turns.
 * The route refuses what the body carries; the runner skips what it would
 * load; the replayed turns are scrubbed here.
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

const BLOCK_TAGS = 'page|source|file|memories|memory|workspace|view|account|conversation_summary|skills|skill';
const BLOCK = new RegExp(`<(${BLOCK_TAGS})\\b[^>]*?(?:/>|>[\\s\\S]*?</\\1>)`, 'g');
const CITATION_MARK = /\s?\[\d{1,3}\]/g;

/**
 * Replayed turns without the quoted blocks and the `[n]` citation marks.
 *
 * Caveat: it is pattern-based. It misses workspace content an earlier answer
 * paraphrased in plain prose, and it also removes a legitimate `[1]` (an
 * array index in code). Under-removal is the dangerous direction; the sure
 * route is a fresh conversation.
 */
export function stripWorkspaceContext(messages: ModelMessage[]): ModelMessage[] {
	return messages.map((message) =>
		typeof message.content === 'string'
			? ({ ...message, content: message.content.replace(BLOCK, '').replace(CITATION_MARK, '').trim() } as ModelMessage)
			: message,
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
