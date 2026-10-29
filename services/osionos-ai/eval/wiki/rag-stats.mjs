/* ************************************************************************** */
/*                                                                            */
/*   rag-stats.mjs               the arithmetic of measure-rag.ts             */
/*                                                                            */
/*   Ranking metrics (binary relevance, ONE relevant page per question),      */
/*   bootstrap confidence intervals, and the abstention threshold. Pure: no   */
/*   I/O, and every draw comes from a seeded generator.                       */
/*                                                                            */
/*   Caveat: a bootstrap CI over 160 questions says how much the number moves */
/*   if the questions were drawn again from the SAME drafting process; it     */
/*   says nothing about the questions being good, or about another corpus.    */
/*   The threshold is the best cut of the calibration half: on a small half   */
/*   it overfits, which is why it is scored on the other half.                */
/*                                                                            */
/*   No dependencies. Node 22.                                                */
/* ************************************************************************** */

import { mulberry32, shuffled } from "./golden.mjs";

export const BOOTSTRAP_RESAMPLES = 1000;
export const BOOTSTRAP_SEED = 42;

/** The 1-based rank of the expected page in a ranked list of page ids, or 0. */
export function rankOf(rankedPages, expected) {
	const index = rankedPages.indexOf(expected);
	return index === -1 ? 0 : index + 1;
}

/** 1 when the expected page is in the first k, else 0. */
export function recallAt(rank, k) {
	return rank >= 1 && rank <= k ? 1 : 0;
}

/** The reciprocal rank, 0 beyond the first k. */
export function reciprocalRankAt(rank, k) {
	return rank >= 1 && rank <= k ? 1 / rank : 0;
}

/** nDCG@k with one relevant page: the ideal gain is 1 at rank 1, so nDCG is 1 / log2(rank + 1). */
export function ndcgAt(rank, k) {
	return rank >= 1 && rank <= k ? 1 / Math.log2(rank + 1) : 0;
}

export function mean(values) {
	return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Nearest-rank percentile of an unsorted list. */
export function percentile(values, fraction) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.max(1, Math.ceil(fraction * sorted.length)) - 1];
}

/**
 * The resamples of a bootstrap: `resamples` arrays of `size` indices drawn
 * with replacement. Drawn once and shared, so two metrics of the same
 * questions (and the difference of two variants) see the same resamples.
 */
export function bootstrapIndices(size, resamples = BOOTSTRAP_RESAMPLES, seed = BOOTSTRAP_SEED) {
	const random = mulberry32(seed);
	return Array.from({ length: resamples }, () => Array.from({ length: size }, () => Math.floor(random() * size)));
}

/** The 95% percentile interval of `statistic` over the resamples of `values`. */
export function bootstrapCi(values, indices, statistic = mean) {
	const estimates = indices.map((draw) => statistic(draw.map((index) => values[index])));
	return { low: percentile(estimates, 0.025), high: percentile(estimates, 0.975) };
}

/** The mean, with its CI. */
export function meanWithCi(values, indices) {
	return { value: mean(values), ...bootstrapCi(values, indices) };
}

/** The paired difference `after - before` of the means, with its CI over shared resamples. */
export function pairedDifference(before, after, indices) {
	const differences = after.map((value, index) => value - before[index]);
	return meanWithCi(differences, indices);
}

/** Precision, recall and F1 of a list of {positive, predicted}; 0 when a denominator is 0. */
export function classification(items) {
	const truePositive = items.filter((item) => item.positive && item.predicted).length;
	const predicted = items.filter((item) => item.predicted).length;
	const positive = items.filter((item) => item.positive).length;
	const precision = predicted === 0 ? 0 : truePositive / predicted;
	const recall = positive === 0 ? 0 : truePositive / positive;
	const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
	return { precision, recall, f1 };
}

/**
 * The calibration and test halves: each holds half of the answerable and
 * half of the unanswerable questions, drawn with the seed. `items` carry a
 * `positive` flag (positive = unanswerable).
 */
export function splitHalves(items, seed = BOOTSTRAP_SEED) {
	const random = mulberry32(seed);
	const calibration = [];
	const test = [];
	for (const positive of [false, true]) {
		const group = shuffled(items.filter((item) => item.positive === positive), random);
		const half = Math.floor(group.length / 2);
		calibration.push(...group.slice(0, half));
		test.push(...group.slice(half));
	}
	return { calibration, test };
}

/**
 * The threshold that maximises the F1 of "abstain when top score < t" on the
 * items (positive = unanswerable). Candidates are the midpoints between
 * consecutive distinct scores, plus one below all and one above all; on a
 * tie the lowest threshold wins, so the cut abstains as little as it can.
 */
export function bestThreshold(items) {
	const scores = [...new Set(items.map((item) => item.score))].sort((left, right) => left - right);
	const candidates = [scores[0] - 1e-6, ...scores.slice(1).map((score, index) => (score + scores[index]) / 2), scores.at(-1) + 1e-6];
	let best = { threshold: candidates[0], f1: -1 };
	for (const threshold of candidates) {
		const { f1 } = classification(items.map((item) => ({ positive: item.positive, predicted: item.score < threshold })));
		if (f1 > best.f1) best = { threshold, f1 };
	}
	return best;
}
