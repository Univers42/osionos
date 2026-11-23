import type { Pool } from 'pg';
import { config } from '../config.ts';
import type { AuthUser } from '../auth.ts';
import type { RunCredential } from './credential.ts';
import { modesAllowed } from './modesConfig.ts';
import { readConversationMode, type StoredMode } from './mode.ts';

/**
 * The mode a run holds, snapshotted once at its start (AM13): later steps read
 * this, never the row, so a PATCH in the middle of a run changes nothing.
 *
 * 'request' is the user's own message and 'decided' a continuation started by
 * the user's own decide request: both carry a live human. 'thread' and the
 * unattended 'continuation' have none, so they stay manual.
 */
export type RunKind = 'request' | 'decided' | 'thread' | 'continuation';

export interface ModeSnapshot extends StoredMode {
	runKind: RunKind;
}

interface ModeInput {
	user: AuthUser | null;
	conversationId: string | null;
	runKind: RunKind;
	credential: RunCredential | null;
}

/**
 * Manual unless the flag, the allowlist, the run kind, a credential and an
 * unscoped session all agree.
 *
 * Caveat: the row is read once; a mode changed after this read applies from the
 * next run. A failed read narrows to manual and is logged (code only): the run
 * has already reserved budget and a row, so throwing here would strand them.
 */
export async function effectiveMode(db: Pool, a: ModeInput): Promise<ModeSnapshot> {
	const manual: ModeSnapshot = { mode: 'manual', anchorPageId: null, runKind: a.runKind };
	const { user, conversationId, credential } = a;
	if (!user || !conversationId || !credential || user.scope !== undefined) return manual;
	if (a.runKind !== 'request' && a.runKind !== 'decided') return manual;
	if (!modesAllowed(config, user.userId)) return manual;
	const stored = await readConversationMode(db, conversationId, user.userId).catch((error: unknown) => {
		console.warn(JSON.stringify({ event: 'mode_read_failed', code: (error as { code?: unknown }).code ?? (error as Error).name }));
		return null;
	});
	return stored ? { ...stored, runKind: a.runKind } : manual;
}
