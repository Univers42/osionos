/**
 * The reranker: a cross-encoder behind the /rerank of text-embeddings-inference.
 *
 * The fusion (search.ts) orders candidates by RRF, and an RRF score says
 * nothing about whether a question is answered at all: the top score of an
 * unanswerable question equals the bottom one of an answered question
 * (eval/RESULTS.md). A cross-encoder reads the question and the passage
 * together, and its score is a probability that the passage answers.
 *
 * Caveat: the score is calibrated for one model and one corpus. A threshold
 * taken from it (shouldAbstain) holds for the model it was measured with, and
 * a change of model needs a new measurement.
 */

/** The default wait for the reranker: it sits on the path of a question. */
export const RERANK_TIMEOUT_MS = 1500;

/** What the caller may set on one call. */
export interface RerankOptions {
	/** The wait before the call fails; default RERANK_TIMEOUT_MS. */
	timeoutMs?: number;
	/** Aborts the call from outside. */
	signal?: AbortSignal;
}

/**
 * The failure of a call.
 *
 * The kind is what the log keeps. The question and the texts are NEVER in
 * the error: they are workspace data.
 */
export class RerankError extends Error {
	readonly kind: string;

	constructor(kind: string) {
		super(kind);
		this.name = 'RerankError';
		this.kind = kind;
	}
}

/** The kind of a failed fetch: a timeout, a caller's abort, or an unreachable service. */
function fetchFailureKind(error: unknown, signal?: AbortSignal): string {
	const name = error instanceof Error ? error.name : '';
	if (name === 'TimeoutError') return 'timeout';
	if (name === 'AbortError' || signal?.aborted) return 'aborted';
	return 'unreachable';
}

/** The scores of an answer, in the order of the texts. */
function scoresOf(payload: unknown, count: number): number[] {
	if (!Array.isArray(payload) || payload.length !== count) throw new RerankError('bad_answer');
	const scores: number[] = new Array<number>(count).fill(Number.NaN);
	for (const entry of payload) {
		const { index, score } = (entry ?? {}) as { index?: unknown; score?: unknown };
		if (typeof index !== 'number' || typeof score !== 'number' || !Number.isInteger(index)) {
			throw new RerankError('bad_answer');
		}
		if (index < 0 || index >= count || !Number.isFinite(score)) throw new RerankError('bad_answer');
		scores[index] = score;
	}
	if (scores.some((score) => Number.isNaN(score))) throw new RerankError('bad_answer');
	return scores;
}

/**
 * The score of every text against the query, in the order of the texts.
 *
 * TEI answers `[{index, score}]` sorted by score; this puts the scores back
 * in the order of the input, so the caller keeps its own order of candidates.
 */
export async function rerank(
	baseUrl: string,
	query: string,
	texts: readonly string[],
	{ timeoutMs = RERANK_TIMEOUT_MS, signal }: RerankOptions = {},
): Promise<number[]> {
	if (texts.length === 0) return [];
	const timeout = AbortSignal.timeout(timeoutMs);
	const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
	let response: Response;
	try {
		response = await fetch(`${baseUrl.replace(/\/+$/, '')}/rerank`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			// raw_scores false: TEI applies a sigmoid, so a score is in (0, 1).
			// truncate: a passage longer than the model takes is cut, not refused.
			body: JSON.stringify({ query, texts, raw_scores: false, truncate: true }),
			signal: combined,
		});
	} catch (error) {
		throw new RerankError(fetchFailureKind(error, signal));
	}
	if (!response.ok) throw new RerankError(`http_${response.status}`);
	let payload: unknown;
	try {
		payload = await response.json();
	} catch (error) {
		const kind = fetchFailureKind(error, signal);
		throw new RerankError(kind === 'unreachable' ? 'bad_answer' : kind);
	}
	return scoresOf(payload, texts.length);
}
