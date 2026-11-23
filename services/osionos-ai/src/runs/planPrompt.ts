import type { ModeSnapshot } from '../modes/effectiveMode.ts';

/** What a plan-mode run is told (AM14): it may read, and it must not claim a change. */
export const PLAN_PROMPT_BLOCK = 'You are planning: end with a numbered plan; do not claim changes.';

/** The system prompt of a run, with the plan block last when the mode is plan. */
export function withPlanBlock(system: string, mode: ModeSnapshot | undefined): string {
	return mode?.mode === 'plan' ? `${system}\n\n${PLAN_PROMPT_BLOCK}` : system;
}
