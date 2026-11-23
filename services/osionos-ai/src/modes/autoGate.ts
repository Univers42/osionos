import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { ToolSet } from 'ai';
import { writeTools } from '../tools/writeToolList.ts';
import { config } from '../config.ts';
import type { AuthUser } from '../auth.ts';
import type { ModeSnapshot } from './effectiveMode.ts';
import type { RunCredential } from './credential.ts';
import type { RunWriteBudget } from './writeBudget.ts';
import { makeStepCounter } from './autoLimits.ts';
import type { StepCounter } from './autoLimits.ts';

/**
 * Everything the decision to apply a write without a human needs, bound to one
 * run (AM4). The credential is a closure: this object holds no token.
 */
export interface AutoGate {
	db: Pool;
	redis: Redis;
	user: AuthUser;
	conversationId: string;
	workspaceId: string;
	runId: string;
	turnId: string;
	snapshot: ModeSnapshot;
	credential: RunCredential | null;
	budget: RunWriteBudget;
	step: StepCounter;
	/** The tool calls of the run still in flight that are not auto-decided writes. */
	reads: Set<Promise<unknown>>;
}

/** What the run hands over: the parts of the gate that only the upstream knows. */
export interface AutoRun {
	redis: Redis;
	mode?: ModeSnapshot;
	credential?: RunCredential | null;
	budget: RunWriteBudget;
	turnId?: string;
}

const MANUAL: ModeSnapshot = { mode: 'manual', anchorPageId: null, runKind: 'continuation' };

/**
 * The gate of a run, or none while OSIONOS_AI_MODES is off or the run has no
 * caller: no gate is today's behaviour, byte for byte.
 *
 * Caveat: with the flag on, a user off the allowlist still gets a gate; its
 * snapshot is manual, so every write is a card with `mode_manual`.
 */
export function makeAutoGate(
	input: { db: Pool; user?: AuthUser; conversationId: string; runId: string; workspaceId?: string; auto?: AutoRun },
): AutoGate | undefined {
	const { user, auto } = input;
	if (!config.modesEnabled || !user || !auto) return undefined;
	return {
		db: input.db,
		redis: auto.redis,
		user,
		conversationId: input.conversationId,
		workspaceId: input.workspaceId ?? user.workspaceId,
		runId: input.runId,
		turnId: auto.turnId ?? input.runId,
		snapshot: auto.mode ?? MANUAL,
		credential: auto.credential ?? null,
		budget: auto.budget,
		step: makeStepCounter(config.autoPerStep),
		reads: new Set(),
	};
}

/**
 * Registers every tool call that is not an auto-decidable write while it runs,
 * so a write's verdict can wait for the reads of its own step: the SDK runs the
 * calls of a step in parallel, and a read that taints the conversation must be
 * seen by the sibling write (laundering, AM3).
 *
 * Caveat: the calls of a step are registered when the SDK starts them, all in
 * the same tick, before any write reaches its verdict (which awaits the
 * database first). A call started in a later tick is not waited for, but then
 * it started after the write's step finished its own dispatch.
 */
export function trackReads(tools: ToolSet, gate: AutoGate): ToolSet {
	const writes = new Set(writeTools(true).map((tool) => tool.name));
	const wrapped: ToolSet = {};
	for (const [name, tool] of Object.entries(tools)) {
		const execute = tool.execute;
		if (writes.has(name) || !execute) {
			wrapped[name] = tool;
			continue;
		}
		wrapped[name] = {
			...tool,
			execute: ((...args: Parameters<typeof execute>) => {
				const running = Promise.resolve(execute(...args));
				const done = () => void gate.reads.delete(running);
				gate.reads.add(running);
				running.then(done, done);
				return running;
			}) as typeof execute,
		} as typeof tool;
	}
	return wrapped;
}
