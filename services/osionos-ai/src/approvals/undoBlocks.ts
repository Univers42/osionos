import { bridgeRead } from './bridge.ts';
import { blockDigest } from './inverseData.ts';
import type { AddedBlock } from './inverseData.ts';
import type { BridgeWrite } from './bridge.ts';

/**
 * The page as the undo reads it, and the precondition of an add_blocks undo.
 *
 * Caveat: a page whose JSON passes READ_MAX_CHARS reads as unparsable and the
 * undo reports 'failed' (the page is untouched, the safe direction).
 */
const READ_MAX_CHARS = 8_000_000;

export type Refusal = { ok: false; code: 'changed_since' | 'failed' | 'not_undoable' };

export interface PageRead {
	/** The page's `contentVersion`; null while the database has no version column. */
	version: number | null;
	title: string;
	content: { id?: unknown; type?: unknown; content?: unknown; children?: unknown }[];
}

/** The page, or the refusal: a gone page is 'changed_since', a read that did not land is 'failed'. */
export async function readPage(a: { bridgeUrl: string; sessionToken: string; pageId: string }): Promise<PageRead | Refusal> {
	const answer = await bridgeRead({ url: a.bridgeUrl, token: a.sessionToken, path: `/api/pages/${a.pageId}`, maxBodyChars: READ_MAX_CHARS });
	if (!answer.ok) return { ok: false, code: answer.status === 404 ? 'changed_since' : 'failed' };
	try {
		const page = JSON.parse(answer.body) as { contentVersion?: unknown; title?: unknown; content?: unknown };
		if (!Array.isArray(page.content)) return { ok: false, code: 'failed' };
		const version = Number.isSafeInteger(page.contentVersion) ? Number(page.contentVersion) : null;
		return { version, title: typeof page.title === 'string' ? page.title : '', content: page.content };
	} catch {
		return { ok: false, code: 'failed' };
	}
}

/** Whether a recorded block is still top-level, unedited and childless. */
function untouched(page: PageRead, recorded: AddedBlock): boolean {
	const block = page.content.find((candidate) => candidate?.id === recorded.id);
	if (!block || recorded.parentId !== null) return false;
	if (Array.isArray(block.children) && block.children.length > 0) return false;
	return blockDigest({ type: String(block.type ?? ''), content: block.content }) === recorded.sha256;
}

/**
 * The PATCH that removes the recorded blocks, or the refusal. It carries the
 * version it read, so a human edit in between is the bridge's 409.
 *
 * Caveat: undo of an append needs the page version column. The bridge omits
 * `contentVersion` while the database has none; the undo then refuses
 * ('not_undoable': the state will not change on a retry) rather than PATCH
 * without a baseVersion and clobber a concurrent human edit.
 * Caveat (R5): a block the user edited is a conflict copy with a new id, so
 * the recorded id is missing and undo refuses, leaving the AI text in place.
 * Caveat: a page that no longer shows the id at the top level (moved into a
 * layout cell) is read as missing, never searched for deeper.
 */
export async function planBlocksUndo(
	a: { bridgeUrl: string; sessionToken: string; pageId: string; blocks: AddedBlock[] },
): Promise<BridgeWrite | Refusal> {
	const page = await readPage(a);
	if (!('content' in page)) return page;
	if (page.version === null) return { ok: false, code: 'not_undoable' };
	if (!a.blocks.every((recorded) => untouched(page, recorded))) return { ok: false, code: 'changed_since' };
	const ids = new Set(a.blocks.map((block) => block.id));
	const content = page.content.filter((block) => !ids.has(String(block?.id)));
	return { method: 'PATCH', path: `/api/pages/${a.pageId}`, body: { content, baseVersion: page.version } };
}
