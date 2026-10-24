/**
 * The page vector: the L2-normalised, token-length-weighted mean of the page's
 * chunk vectors.
 *
 * A page is a set of chunks, and a chunk says little on its own: the page's
 * vector is what the "related pages" read compares. The chunks are weighted by
 * their length, so a long block counts more than a one-line remark, and the
 * mean is normalised, so the cosine distance of two pages is the cosine
 * distance of their contents.
 *
 * Pure: no database, no clock. The indexer writes the result, the related
 * read compares it.
 */

/** One chunk of a page: its vector, and its weight in the page's mean. */
export interface WeightedVector {
	/** The vector, as its numbers. */
	vector: number[];
	/** The number of tokens of the chunk: its weight in the mean. */
	tokens: number;
}

/**
 * The page vector: the weighted mean of the chunks, L2-normalised.
 *
 * `null` when there is nothing to average (no chunk, no vector, a zero
 * vector): the page is then written without a vector, and the related read
 * says it has no neighbours.
 */
export function pageVector(chunks: readonly WeightedVector[]): number[] | null {
	if (chunks.length === 0) return null;
	const dimension = chunks[0].vector.length;
	if (dimension === 0) return null;
	const sum = new Array<number>(dimension).fill(0);
	let weight = 0;
	for (const chunk of chunks) {
		// A chunk of another model has another dimension: the mean would be
		// meaningless, so the page gets no vector.
		if (chunk.vector.length !== dimension) return null;
		const share = Math.max(1, chunk.tokens);
		weight += share;
		for (let index = 0; index < dimension; index += 1) sum[index] += share * chunk.vector[index];
	}
	if (weight === 0) return null;
	const mean = sum.map((value) => value / weight);
	const norm = Math.sqrt(mean.reduce((total, value) => total + value * value, 0));
	if (!Number.isFinite(norm) || norm === 0) return null;
	return mean.map((value) => value / norm);
}

/**
 * The vector of a chunk, read from the text the database gives.
 *
 * `null` when the text is not a vector: the page is then written without one.
 */
export function parseVector(text: string | null | undefined): number[] | null {
	if (typeof text !== 'string' || text.length === 0) return null;
	try {
		const parsed: unknown = JSON.parse(text);
		if (!Array.isArray(parsed)) return null;
		const numbers = parsed.map((value) => Number(value));
		return numbers.every((value) => Number.isFinite(value)) ? numbers : null;
	} catch {
		return null;
	}
}
