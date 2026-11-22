import type { Pool } from 'pg';

/**
 * The assist mode a conversation runs in, and its storage (AM10, AM11).
 *
 * Only the mode and the anchor are stored here; whether a user MAY hold a mode
 * is the route's decision, not the row's.
 */
export type AssistMode = 'manual' | 'plan' | 'accept_edits' | 'auto';

export interface StoredMode {
	mode: AssistMode;
	anchorPageId: string | null;
}

/** Manual and plan never write; accept_edits writes under an anchor; auto writes anywhere. */
export function writeRank(m: AssistMode): 0 | 1 | 2 {
	if (m === 'auto') return 2;
	return m === 'accept_edits' ? 1 : 0;
}

const MANUAL: StoredMode = { mode: 'manual', anchorPageId: null };

/**
 * The mode with the lower write rank; equal ranks keep `a`.
 *
 * Caveat: two accept_edits modes with different anchors have no common scope
 * that this pair can express, so the answer is manual (the safe direction: it
 * never widens a write). Equal anchors keep `a`.
 */
export function narrower(a: StoredMode, b: StoredMode): StoredMode {
	const ra = writeRank(a.mode);
	const rb = writeRank(b.mode);
	if (ra !== rb) return ra < rb ? a : b;
	if (ra === 1 && a.anchorPageId !== b.anchorPageId) return MANUAL;
	return a;
}

interface ModeRow {
	assist_mode: AssistMode;
	assist_anchor_page_id: string | null;
}

/** The stored mode of a conversation the caller owns; null when it is not theirs. */
export async function readConversationMode(db: Pool, conversationId: string, ownerId: string): Promise<StoredMode | null> {
	const result = await db.query<ModeRow>(
		'select assist_mode, assist_anchor_page_id from public.ai_conversations where id = $1 and owner_id = $2',
		[conversationId, ownerId],
	);
	const row = result.rows[0];
	return row ? { mode: row.assist_mode, anchorPageId: row.assist_anchor_page_id } : null;
}

/** Stores the mode, stamping the moment; false when no conversation of the owner matched. */
export async function writeConversationMode(db: Pool, conversationId: string, ownerId: string, m: StoredMode): Promise<boolean> {
	const result = await db.query(
		`update public.ai_conversations
		 set assist_mode = $3, assist_anchor_page_id = $4, assist_mode_set_at = now()
		 where id = $1 and owner_id = $2`,
		[conversationId, ownerId, m.mode, m.anchorPageId],
	);
	return (result.rowCount ?? 0) > 0;
}
