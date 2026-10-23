/**
 * The /predict client of text-embeddings-inference: a sequence classifier
 * served by TEI answers, for each input, the score of every label.
 *
 * No retry here: the job worker owns the retries (backoff, attempts), and a
 * retry inside would multiply the load on a classifier that is already slow.
 *
 * The errors never carry the inputs or the body of the answer: an input is
 * the text of a person's comment, and a TEI error body may echo it.
 */

/** One label of a prediction, with its score. */
export interface LabelScore {
	label: string;
	score: number;
}

/** The kinds of failure a caller tells apart. */
export type TeiErrorKind = 'timeout' | 'http' | 'shape' | 'network';

/** A failed call: its kind, and the HTTP status for an 'http' one. */
export class TeiError extends Error {
	readonly kind: TeiErrorKind;
	readonly status: number | null;

	constructor(kind: TeiErrorKind, message: string, status: number | null = null) {
		super(message);
		this.name = 'TeiError';
		this.kind = kind;
		this.status = status;
	}
}

export interface TeiPredictOptions {
	/** The bound on the whole call, in milliseconds. */
	timeoutMs: number;
	/** The caller's signal: a stopping worker aborts the call. */
	signal?: AbortSignal;
}

// The shape of one prediction: [{label, score}, ...], or null when it is not.
function parsePrediction(value: unknown): LabelScore[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const labels: LabelScore[] = [];
	for (const item of value) {
		if (typeof item !== 'object' || item === null) return null;
		const { label, score } = item as { label?: unknown; score?: unknown };
		if (typeof label !== 'string' || typeof score !== 'number' || !Number.isFinite(score)) return null;
		labels.push({ label, score });
	}
	return labels;
}

/**
 * The scores of every label for each text, in the order of the texts. The
 * texts are truncated to the model's window by the server (truncate: true).
 */
export async function teiPredict(
	baseUrl: string,
	texts: string[],
	options: TeiPredictOptions,
): Promise<LabelScore[][]> {
	const timeout = AbortSignal.timeout(options.timeoutMs);
	const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
	let response: Response;
	try {
		response = await fetch(`${baseUrl.replace(/\/+$/, '')}/predict`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ inputs: texts, truncate: true }),
			signal,
		});
	} catch (error) {
		if (timeout.aborted) throw new TeiError('timeout', `the classifier did not answer in ${options.timeoutMs} ms`);
		if (options.signal?.aborted) throw new TeiError('network', 'the call was aborted');
		throw new TeiError('network', `the classifier is unreachable (${(error as Error).name})`);
	}
	if (!response.ok) {
		await response.body?.cancel().catch(() => undefined);
		throw new TeiError('http', `the classifier answered HTTP ${response.status}`, response.status);
	}
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		if (timeout.aborted) throw new TeiError('timeout', `the classifier did not answer in ${options.timeoutMs} ms`);
		throw new TeiError('shape', 'the classifier answered a body that is not JSON');
	}
	if (!Array.isArray(body) || body.length !== texts.length) {
		throw new TeiError('shape', 'the classifier did not answer one prediction per text');
	}
	const out: LabelScore[][] = [];
	for (const item of body) {
		const prediction = parsePrediction(item);
		if (!prediction) throw new TeiError('shape', 'a prediction is not a list of {label, score}');
		out.push(prediction);
	}
	return out;
}
