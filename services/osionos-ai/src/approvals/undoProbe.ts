import type { AppliedResult } from './inverseData.ts';
import { readPage } from './undoBlocks.ts';

/**
 * After a lost answer to the undo write: did the inverse land anyway?
 *
 * A write whose answer never came may still have applied, and giving the claim
 * back then would leave the row saying "not undone" over an undone page (the
 * osionos#333 undoItem defect class).
 *
 * Caveat: the probe is one read. When it cannot read the page, or the page
 * shows neither the inverse nor the original, it answers false and the claim
 * is released; a write that lands after the probe is then seen by a retry as
 * 'changed_since'. A timeout that applies the write later than the probe is
 * the rare direction; the row is never claimed forever without a write.
 */
export async function inverseLanded(
	a: { bridgeUrl: string; sessionToken: string },
	recorded: AppliedResult,
	baseVersion: unknown,
): Promise<boolean> {
	const pageId = recorded.tool === 'create_page' ? recorded.createdPageId : recorded.pageId;
	if (!pageId) return false;
	const page = await readPage({ ...a, pageId });
	if (!('content' in page)) return false;
	if (recorded.tool === 'create_page') return page.archived;
	if (recorded.tool === 'rename_page') return recorded.previousTitle !== null && page.title === (recorded.previousTitle || 'Untitled');
	const ids = new Set(recorded.blocks.map((block) => block.id));
	const gone = !page.content.some((block) => ids.has(String(block?.id)));
	return gone && typeof baseVersion === 'number' && page.version !== null && page.version > baseVersion;
}
