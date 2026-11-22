import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

/**
 * What a write did, in the words an undo needs: the ids it minted, the title
 * it replaced, the page it created. Recorded on the approval row at apply time.
 */
export interface AddedBlock {
	id: string;
	parentId: string | null;
	/** The place in the batch the write sent, 0..n-1; not the place on the page. */
	index: number;
	/** sha256 of type + content: an undo removes a block only while it still reads the same. */
	sha256: string;
}

export type AppliedResult =
	| { tool: 'add_blocks'; pageId: string; version: number | null; blocks: AddedBlock[]; summary: string }
	| { tool: 'rename_page'; pageId: string; previousTitle: string | null; appliedTitle: string }
	| { tool: 'create_page'; createdPageId: string | null; parentPageId: string | null };

/**
 * The digest of a block's type and content, as sent.
 *
 * Caveat: it hashes the content as the write sent it. If the bridge normalises
 * the content, the digest never matches what the page holds and undo refuses
 * to remove the block (the safe direction). `language` is not in the hash: a
 * code block whose language changed still matches.
 */
export function blockDigest(block: { type: string; content: unknown }): string {
	return createHash('sha256').update(JSON.stringify([block.type, block.content])).digest('hex');
}

/**
 * The title of a page right now, read before a rename goes out.
 *
 * Caveat (R3): a human rename landing between this read and the PATCH is
 * recorded as the "previous" title.
 */
export async function readTitleBefore(db: Pool, pageId: string): Promise<string | null> {
	const result = await db.query<{ title: string }>('select title from public.osionos_pages where id = $1', [pageId]);
	return result.rows[0]?.title ?? null;
}
