import type { Pool } from 'pg';
import { effectiveMode, type ModeSnapshot, type RunKind } from '../modes/effectiveMode.ts';
import type { RunCredential } from '../modes/credential.ts';
import { markRunStart, type RunStartRaw } from '../provenance/runStart.ts';

/** What `startRun` takes for the assist modes; `StartRunInput` extends it. */
export interface ModeRunInput {
	/** Who started the run (AM13); absent is the unattended continuation. */
	runKind?: RunKind;
	/** The session the run holds for later writes (AM1). */
	credential?: RunCredential | null;
	/** The user turn the run belongs to; absent, the run's own id. */
	turnId?: string;
}

/** What `runUpstream` is handed for the modes: the snapshot, the credential and the turn. */
export interface ModeRunFields {
	mode: ModeSnapshot;
	credential: RunCredential | null;
	turnId?: string;
}

/**
 * The mode the run holds (AM13), read once, then the conversation's taint
 * written before the model sees what this run hands it (AM3). Null when the
 * taint could not be written: the run must then be refused, never run untainted.
 */
export async function startRunMode(db: Pool, input: ModeRunInput, raw: RunStartRaw): Promise<ModeRunFields | null> {
	const credential = input.credential ?? null;
	const mode = await effectiveMode(db, { user: raw.user ?? null, conversationId: raw.conversationId, runKind: input.runKind ?? 'continuation', credential });
	const marked = await markRunStart(db, raw).then(() => true, () => false);
	if (!marked) return null;
	return { mode, credential, ...(input.turnId ? { turnId: input.turnId } : {}) };
}
