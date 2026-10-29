/**
 * The numbers of the answer evaluation, pure functions.
 */

export interface ScoreResult {
	faithfulnessRate: number;
	meanRelevance: number;
	abstentionPrecision: number;
	abstentionRecall: number;
}

export interface OriginScores {
	origin: string;
	faithfulnessRate: number;
	meanRelevance: number;
	abstentionPrecision: number;
	abstentionRecall: number;
	count: number;
}

export interface Verdict {
	faithful: boolean;
	relevant: number;
	abstained: boolean;
}

export interface LabeledAnswer {
	questionId: string;
	answerable: boolean;
	origin: string;
	verdict: Verdict | null;
}

/**
 * Faithfulness rate: share of answers judged faithful.
 */
export function faithfulnessRate(verdicts: (Verdict | null)[]): number {
	const valid = verdicts.filter((v): v is Verdict => v !== null);
	if (valid.length === 0) return 0;
	return valid.filter((v) => v.faithful).length / valid.length;
}

/**
 * Mean relevance.
 */
export function meanRelevance(verdicts: (Verdict | null)[]): number {
	const valid = verdicts.filter((v): v is Verdict => v !== null);
	if (valid.length === 0) return 0;
	return valid.reduce((sum, v) => sum + v.relevant, 0) / valid.length;
}

/**
 * Abstention precision: of the answers that abstained, the share whose
 * question was unanswerable.
 */
export function abstentionPrecision(items: LabeledAnswer[]): number {
	const abstained = items.filter((item) => item.verdict?.abstained === true);
	if (abstained.length === 0) return 0;
	const correct = abstained.filter((item) => !item.answerable).length;
	return correct / abstained.length;
}

/**
 * Abstention recall: of the unanswerable questions, the share abstained.
 */
export function abstentionRecall(items: LabeledAnswer[]): number {
	const unanswerable = items.filter((item) => !item.answerable);
	if (unanswerable.length === 0) return 0;
	const abstained = unanswerable.filter((item) => item.verdict?.abstained === true).length;
	return abstained / unanswerable.length;
}

/**
 * Score a set of labeled answers, returning the four numbers.
 */
export function score(items: LabeledAnswer[]): ScoreResult {
	const verdicts = items.map((item) => item.verdict);
	return {
		faithfulnessRate: faithfulnessRate(verdicts),
		meanRelevance: meanRelevance(verdicts),
		abstentionPrecision: abstentionPrecision(items),
		abstentionRecall: abstentionRecall(items),
	};
}

/**
 * Score split by origin.
 */
export function scoreByOrigin(items: LabeledAnswer[]): OriginScores[] {
	const origins = [...new Set(items.map((item) => item.origin))];
	return origins.map((origin) => {
		const subset = items.filter((item) => item.origin === origin);
		const s = score(subset);
		return {
			origin,
			faithfulnessRate: s.faithfulnessRate,
			meanRelevance: s.meanRelevance,
			abstentionPrecision: s.abstentionPrecision,
			abstentionRecall: s.abstentionRecall,
			count: subset.length,
		};
	});
}

/**
 * Cohen's kappa for two boolean arrays.
 */
export function cohenKappa(a: boolean[], b: boolean[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	const n = a.length;
	let agree = 0;
	let aTrue = 0;
	let bTrue = 0;
	for (let i = 0; i < n; i++) {
		if (a[i] === b[i]) agree++;
		if (a[i]) aTrue++;
		if (b[i]) bTrue++;
	}
	const po = agree / n;
	const pe = (aTrue / n) * (bTrue / n) + ((n - aTrue) / n) * ((n - bTrue) / n);
	if (pe === 1) return 1;
	return (po - pe) / (1 - pe);
}

/**
 * Spearman rank correlation.
 */
export function spearman(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	const n = a.length;
	// Rank the values.
	function rank(values: number[]): number[] {
		const sorted = [...values].map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
		const ranks = new Array(n);
		let i = 0;
		while (i < n) {
			let j = i;
			while (j < n - 1 && sorted[j + 1].v === sorted[i].v) j++;
			const avgRank = (i + j) / 2 + 1;
			for (let k = i; k <= j; k++) {
				ranks[sorted[k].i] = avgRank;
			}
			i = j + 1;
		}
		return ranks;
	}
	const ra = rank(a);
	const rb = rank(b);
	const meanA = ra.reduce((s, v) => s + v, 0) / n;
	const meanB = rb.reduce((s, v) => s + v, 0) / n;
	let num = 0;
	let denA = 0;
	let denB = 0;
	for (let i = 0; i < n; i++) {
		const da = ra[i] - meanA;
		const db = rb[i] - meanB;
		num += da * db;
		denA += da * da;
		denB += db * db;
	}
	if (denA === 0 || denB === 0) return 0;
	return num / Math.sqrt(denA * denB);
}