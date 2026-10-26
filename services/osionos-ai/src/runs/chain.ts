import { config } from '../config.ts';
import type { ResolvedTarget } from '../gateway/resolve.ts';
import type { ChainStep } from './attempt.ts';
import { estimateRunMicroUsd } from './estimate.ts';

/**
 * The money a run reserves on a target, and the chain of targets it may move
 * to. The price is the TARGET's: a fallback that is dearer than the primary
 * reserves its own, larger amount when the run gets there.
 */

type EstimateInputs = Parameters<typeof estimateRunMicroUsd>[1];

export function reservationOf(target: ResolvedTarget, inputs: EstimateInputs, imageCount: number): number {
	const imageMicroUsd = Math.ceil(
		(imageCount * config.visionTokensPerImage * target.pricing.inputMicroUsdPerMTok) / 1e6,
	);
	return estimateRunMicroUsd(target.pricing, inputs) + imageMicroUsd;
}

/**
 * The fallbacks of a run, in order, each with its reservation. A target that
 * cannot see is skipped when the run carries images (devil C253): the
 * primary's vision check does not vouch for it.
 */
export function chainSteps(
	fallbacks: readonly ResolvedTarget[],
	inputs: EstimateInputs,
	imageCount: number,
): ChainStep[] {
	return fallbacks
		.filter((target) => imageCount === 0 || target.vision)
		.map((target) => ({ target, amount: reservationOf(target, inputs, imageCount) }));
}
