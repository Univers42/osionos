/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-model.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The recommender's maths, in the bridge: the fold-in of a user, the diversity
 * of the slate and the explanation of a recommendation. The signature that
 * seals a slate is bridge-recs-slate.mjs.
 *
 * PURE: no I/O, no clock, no randomness, no import. Every function here is a pure
 * function of its arguments, so the numbers can be checked against the Python
 * reference (services/osionos-ml/osml/foldin.py) without a server and without
 * a database.
 *
 * WHY CHOLESKY
 *   The fold-in solves (YᵀY + λI + Σ(cᵢ−1)yᵢyᵢᵀ) x = Σ cᵢ yᵢ. That matrix is
 *   SYMMETRIC POSITIVE DEFINITE: λ > 0 makes YᵀY + λI positive definite whatever
 *   the catalogue is, and the added terms Σ(cᵢ−1)yᵢyᵢᵀ are positive
 *   semi-definite. Cholesky factors it A = LLᵀ and the solve is two
 *   triangular substitutions. The matrix is NEVER inverted: an explicit inverse
 *   would be a second, worse approximation of the same numbers.
 *
 * WHY THE EXPLANATION IS EXACT
 *   Hu, Koren & Volinsky (2008) §5: in the iALS user step, the contribution of
 *   an item j to the score of an item i is cⱼ · (yᵢᵀ A⁻¹ yⱼ). A⁻¹ is applied
 *   with the SAME factor L, so the "why" is the very quantity the ranking
 *   used — not a story told after the fact.
 */

/** The summed weight of one item's events, with the CHAMPION's weights. */
function eventWeightSum(events, weights) {
	if (!events || typeof events !== 'object' || Array.isArray(events)) return 0;
	let sum = 0;
	for (const [name, count] of Object.entries(events)) {
		const weight = Number(weights[name]);
		const times = Number(count);
		if (!Number.isFinite(weight) || !Number.isFinite(times)) continue;
		sum += weight * times;
	}
	return sum;
}

/**
 * The user's items, with the weight that brings them into the fold-in: the
 * weight of an item is the sum of count × weight over its events, with the
 * weights the CHAMPION was trained with — never a copy of the bridge's own.
 * An item with no weight or no vector does not enter.
 *
 * @param {unknown} recent the context's recent items
 * @param {Record<string, number>} eventWeights the champion's event weights
 * @returns {{ itemId: string, vector: number[], weight: number }[]}
 */
export function itemWeights(recent, eventWeights) {
	const weights = eventWeights && typeof eventWeights === 'object' ? eventWeights : {};
	const entries = Array.isArray(recent) ? recent : [];
	const out = [];
	for (const entry of entries) {
		if (!entry || typeof entry !== 'object') continue;
		const vector = Array.isArray(entry.vector) ? entry.vector.map(Number) : null;
		if (!vector || vector.length === 0) continue;
		if (vector.some((value) => !Number.isFinite(value))) continue;
		const weight = eventWeightSum(entry.events, weights);
		if (!(weight > 0)) continue;
		out.push({ itemId: String(entry.item_id ?? ''), vector, weight });
	}
	return out;
}

/**
 * The items with the CONFIDENCE the fold-in gives them: cᵢ = 1 + α·wᵢ. The
 * confidence is the scale of an item's contribution (a page the user shared
 * counts for more than a page they liked), and it is the same number the
 * explanation weighs.
 *
 * @param {{ itemId: string, vector: number[], weight: number }[]} items
 * @param {number} alpha the champion's alpha
 * @returns {{ itemId: string, vector: number[], weight: number, confidence: number }[]}
 */
export function confidences(items, alpha) {
	const list = Array.isArray(items) ? items : [];
	return list.map((item) => ({ ...item, confidence: 1 + Number(alpha || 0) * Number(item.weight || 0) }));
}

/** The gram of the champion, as a k×k row-major matrix. */
function gramMatrix(gram, size) {
	const values = Array.isArray(gram) ? gram.map(Number) : [];
	if (values.length !== size * size || values.some((value) => !Number.isFinite(value))) {
		throw new Error('The item gram is not a square matrix of finite numbers.');
	}
	return Float64Array.from(values);
}

/**
 * The Cholesky factor L of A: A = LLᵀ, L lower triangular, row-major.
 * A matrix that is not positive definite is REFUSED with a throw — never a
 * NaN that would travel into the ranking.
 */
function cholesky(a, size) {
	const l = new Float64Array(size * size);
	for (let i = 0; i < size; i += 1) {
		for (let j = 0; j <= i; j += 1) {
			let sum = a[i * size + j];
			for (let p = 0; p < j; p += 1) sum -= l[i * size + p] * l[j * size + p];
			if (i === j) {
				if (!(sum > 0)) throw new Error('The fold-in matrix is not positive definite.');
				l[i * size + j] = Math.sqrt(sum);
			} else {
				l[i * size + j] = sum / l[j * size + j];
			}
		}
	}
	return l;
}

/** The forward substitution L z = rhs. */
function forwardSolve(l, size, rhs) {
	const z = new Float64Array(size);
	for (let i = 0; i < size; i += 1) {
		let sum = rhs[i];
		for (let p = 0; p < i; p += 1) sum -= l[i * size + p] * z[p];
		z[i] = sum / l[i * size + i];
	}
	return z;
}

/** The back substitution Lᵀ x = rhs. */
function backSolve(l, size, rhs) {
	const x = new Float64Array(size);
	for (let i = size - 1; i >= 0; i -= 1) {
		let sum = rhs[i];
		for (let p = i + 1; p < size; p += 1) sum -= l[p * size + i] * x[p];
		x[i] = sum / l[i * size + i];
	}
	return x;
}

/** The solve of A x = b through the factor: two triangular substitutions. */
function solveCholesky(l, size, b) {
	return backSolve(l, size, forwardSolve(l, size, b));
}

/** A vector of exactly `size` numbers, the extra ones dropped, the missing ones zero. */
function sizedVector(vector, size) {
	const out = new Float64Array(size);
	const values = Array.isArray(vector) ? vector : [];
	for (let i = 0; i < size && i < values.length; i += 1) {
		const value = Number(values[i]);
		out[i] = Number.isFinite(value) ? value : 0;
	}
	return out;
}

/**
 * The fold-in of a user: their vector in the champion's space, and the factor
 * that produced it.
 *
 * A = YᵀY + λI + Σ(cᵢ−1)yᵢyᵢᵀ, b = Σ cᵢ yᵢ, x = A⁻¹b — solved by Cholesky,
 * never inverted. `gram` is the champion's YᵀY (row-major, k² numbers) and the
 * items are the user's, with the weights and the vectors the context gave.
 *
 * @param {number[]} gram the champion's item gram, row-major
 * @param {number} k the number of factors
 * @param {{ itemId: string, vector: number[], weight: number }[]} items the user's items
 * @param {number} regularization the champion's lambda
 * @param {number} alpha the champion's alpha
 * @returns {{ vector: Float64Array, chol: Float64Array } | null} null without items
 */
export function foldIn(gram, k, items, regularization, alpha) {
	const list = Array.isArray(items) ? items : [];
	if (list.length === 0) return null;
	const size = Number(k);
	if (!Number.isInteger(size) || size < 1) throw new Error('The factor count must be a positive integer.');
	const a = gramMatrix(gram, size);
	const b = new Float64Array(size);
	for (let i = 0; i < size; i += 1) a[i * size + i] += Number(regularization) || 0;
	for (const item of confidences(list, alpha)) {
		const y = sizedVector(item.vector, size);
		const c = item.confidence;
		for (let i = 0; i < size; i += 1) {
			b[i] += c * y[i];
			for (let j = 0; j < size; j += 1) a[i * size + j] += (c - 1) * y[i] * y[j];
		}
	}
	const chol = cholesky(a, size);
	return { vector: solveCholesky(chol, size, b), chol };
}

/**
 * The item that best explains a candidate (Hu, Koren & Volinsky 2008 §5):
 * the contribution of item j to item i is cⱼ · (yᵢᵀ A⁻¹ yⱼ), and A⁻¹ is
 * applied with the SAME factor the fold-in used — two triangular solves.
 *
 * @param {Float64Array} chol the Cholesky factor of A
 * @param {number} k the number of factors
 * @param {number[]} candidateVector the candidate's vector
 * @param {{ itemId: string, vector: number[], confidence?: number }[]} items the user's items
 * @returns {string | null} the item's id, or null when nothing contributes
 */
export function explain(chol, k, candidateVector, items) {
	const size = Number(k);
	const list = (Array.isArray(items) ? items : []).filter((item) => item && item.vector && item.itemId);
	if (list.length === 0 || !chol) return null;
	const z = backSolve(chol, size, forwardSolve(chol, size, sizedVector(candidateVector, size)));
	let best = null;
	let bestScore = 0;
	for (const item of list) {
		const y = sizedVector(item.vector, size);
		let dot = 0;
		for (let i = 0; i < size; i += 1) dot += z[i] * y[i];
		const score = (Number(item.confidence ?? 1)) * dot;
		if (score > bestScore) {
			bestScore = score;
			best = String(item.itemId);
		}
	}
	return best;
}

/** The cosine of two vectors; a missing or null vector is no similarity. */
function cosine(left, right) {
	const a = Array.isArray(left) ? left : [];
	const b = Array.isArray(right) ? right : [];
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
		const x = Number(a[i]);
		const y = Number(b[i]);
		if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	if (!(na > 0) || !(nb > 0)) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * The slate's diversity: the greedy MMR (Maximal Marginal Relevance) of the
 * candidates. The relevance is the score, min-max normalised over the set; the
 * penalty is the similarity to what is already chosen; λ weighs the two. At
 * most `authorCap` items of one author, and a tie keeps the lower index.
 *
 * @param {{ id: string, ownerId: string, score: number, vector: number[] }[]} candidates
 * @param {{ limit?: number, lambda?: number, authorCap?: number }} [options]
 * @returns {typeof candidates} the chosen candidates, in order
 */
export function mmr(candidates, { limit, lambda = 0.7, authorCap = 2 } = {}) {
	const list = Array.isArray(candidates) ? candidates : [];
	const wanted = Number.isFinite(Number(limit)) ? Math.max(0, Math.floor(Number(limit))) : list.length;
	if (wanted === 0 || list.length === 0) return [];
	const scores = list.map((candidate) => Number(candidate?.score) || 0);
	const min = Math.min(...scores);
	const span = Math.max(...scores) - min;
	const relevance = scores.map((score) => (span > 0 ? (score - min) / span : 0));
	const chosen = [];
	const picked = new Set();
	const perOwner = new Map();
	while (chosen.length < wanted) {
		let bestIndex = -1;
		let bestValue = Number.NEGATIVE_INFINITY;
		for (let i = 0; i < list.length; i += 1) {
			if (picked.has(i)) continue;
			const owner = String(list[i]?.ownerId ?? '');
			if ((perOwner.get(owner) ?? 0) >= authorCap) continue;
			let similarity = 0;
			for (const other of chosen) similarity = Math.max(similarity, cosine(list[i]?.vector, other.vector));
			const value = lambda * relevance[i] - (1 - lambda) * similarity;
			if (value > bestValue) {
				bestValue = value;
				bestIndex = i;
			}
		}
		if (bestIndex < 0) break;
		picked.add(bestIndex);
		chosen.push(list[bestIndex]);
		const owner = String(list[bestIndex]?.ownerId ?? '');
		perOwner.set(owner, (perOwner.get(owner) ?? 0) + 1);
	}
	return chosen;
}
