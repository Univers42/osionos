import type { PumpInput } from './streamPump.ts';

type StepStart = NonNullable<PumpInput['onStepStart']>;

/**
 * The `onStepStart` the pump gets: the research hook, the write-step reset of
 * an auto run, or both in that order. Neither means no hook at all, so a run
 * with the modes flag off passes exactly what it passed before.
 */
export function stepStartHook(autoReset: (() => void) | undefined, research: StepStart | undefined): { onStepStart?: StepStart } {
	if (!autoReset) return research ? { onStepStart: research } : {};
	return {
		onStepStart: async (step) => {
			autoReset();
			await research?.(step);
		},
	};
}
