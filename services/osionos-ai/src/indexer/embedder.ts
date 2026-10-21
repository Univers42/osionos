/**
 * The embedding client: the local text-embeddings-inference service.
 *
 * The service is the one the deployment runs next to the app (OSIONOS_AI_EMBED_URL):
 * nothing leaves the machine. The model is multilingual-e5, and that model
 * NEEDS its prefixes: a passage is embedded as "passage: …" and a query as
 * "query: …". An input without its prefix is embedded in the wrong space, and
 * the retrieval then answers with the neighbours of nothing.
 *
 * The client is the ENGINE ADAPTER: it is the only place that knows what the
 * service accepts (how many inputs per request). The indexer above it only
 * knows the interface below.
 */

/** The configuration of the client. */
export interface EmbedderOptions {
	/** The base URL of the embedding service: OSIONOS_AI_EMBED_URL. */
	baseUrl: string;
	/** The name of the model the service loads: OSIONOS_AI_EMBED_MODEL. */
	model: string;
	/** The most inputs of one request: the limit of the service. */
	maxInputsPerRequest?: number;
}

/** The size of the vectors: the model is a 384-dimension one. */
export const EMBED_DIMS = 384;

/**
 * The number of inputs of one request.
 *
 * It is the client batch size of the service (text-embeddings-inference
 * refuses more than 32 inputs per request and answers 422), and it is a
 * constructor option: another engine may take more.
 */
export const EMBED_BATCH_SIZE = 32;

/** The timeout of one request. */
export const EMBED_TIMEOUT_MS = 30_000;

/** The prefix of a passage: multilingual-e5 needs it. */
export const PASSAGE_PREFIX = 'passage: ';

/** The prefix of a query: multilingual-e5 needs it. */
export const QUERY_PREFIX = 'query: ';

/** The answer of a call: the vectors, and how long the call took. */
export interface EmbedResult {
	/** The vectors, in the order of the inputs. */
	vectors: number[][];
	/** The time the call took, in milliseconds. */
	ms: number;
	/** The status the service answered with: 200 when it answered. */
	status: number;
}

/**
 * The failure of a call.
 *
 * The code is what the queue keeps (a human reads it) and the status is what
 * the concurrency controller reads: a 429 or a 503 is the service pushing
 * back. The text that was embedded is NEVER in the error.
 */
export class EmbedError extends Error {
	readonly code: string;
	readonly status: number | undefined;

	constructor(code: string, status?: number) {
		super(code);
		this.name = 'EmbedError';
		this.code = code;
		this.status = status;
	}
}

/**
 * What the indexer needs from an embedder.
 *
 * It is an interface, not the class: the tests and the measurements put their
 * own client in, and the engine of the day (TEI now, an OpenAI-compatible
 * service later) is behind it.
 */
export interface EmbedClient {
	/** The name of the model: the chunks carry it, so a change is visible. */
	readonly model: string;
	/** The most inputs the engine takes in one request. */
	readonly maxInputsPerRequest: number;
	/** The input of a passage: its heading path and its text, prefixed. */
	passageInput(headingPath: string, content: string): string;
	/** One call: the vectors of the inputs, and how long it took. */
	embedCall(inputs: readonly string[]): Promise<EmbedResult>;
}

/**
 * The client of the embedding service.
 *
 * The errors it throws carry a code and never the text that was embedded: the
 * message of a failure ends up in the queue, and the queue is read by humans.
 */
export class Embedder implements EmbedClient {
	private readonly baseUrl: string;

	/** The name of the model: the chunks carry it, so a change is visible. */
	readonly model: string;

	/** The most inputs the engine takes in one request. */
	readonly maxInputsPerRequest: number;

	constructor(options: EmbedderOptions) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, '');
		this.model = options.model;
		this.maxInputsPerRequest = Math.max(1, Math.floor(options.maxInputsPerRequest ?? EMBED_BATCH_SIZE));
	}

	/** The input of a passage: its heading path and its text, prefixed. */
	passageInput(headingPath: string, content: string): string {
		return `${PASSAGE_PREFIX}${headingPath}\n${content}`;
	}

	/** The input of a query, prefixed. The retrieval embeds its queries. */
	queryInput(text: string): string {
		return `${QUERY_PREFIX}${text}`;
	}

	/**
	 * The vectors of the inputs, in the order of the inputs.
	 *
	 * The retrieval embeds one query at a time; the indexer packs the chunks
	 * of a round into calls and calls embedCall.
	 */
	async embed(inputs: readonly string[]): Promise<number[][]> {
		return (await this.embedCall(inputs)).vectors;
	}

	/**
	 * One call: the vectors of the inputs, and the time it took.
	 *
	 * A call is sent as one request when the engine takes that many inputs,
	 * and as several when it does not: the service refuses more than its own
	 * client batch size with a 422.
	 */
	async embedCall(inputs: readonly string[]): Promise<EmbedResult> {
		const started = Date.now();
		const vectors: number[][] = [];
		let status = 200;
		for (let index = 0; index < inputs.length; index += this.maxInputsPerRequest) {
			const part = inputs.slice(index, index + this.maxInputsPerRequest);
			const answer = await this.embedRequest(part);
			vectors.push(...answer.vectors);
			status = answer.status;
		}
		return { vectors, ms: Date.now() - started, status };
	}

	/** One request to the service: the inputs in, the vectors out. */
	private async embedRequest(inputs: readonly string[]): Promise<{ vectors: number[][]; status: number }> {
		let response: Response;
		try {
			response = await fetch(`${this.baseUrl}/embed`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				// truncate: the service cuts the inputs that are longer than the
				// limit of the model (512 tokens), instead of refusing them.
				body: JSON.stringify({ inputs, truncate: true }),
				signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
			});
		} catch (error) {
			// The service is down, or too slow: the reason is the same for the
			// worker, which retries with a backoff. A timeout is its own code:
			// the concurrency controller halves on it.
			const name = error instanceof Error ? error.name : '';
			throw new EmbedError(name === 'TimeoutError' ? 'tei_timeout' : 'tei_unreachable');
		}
		if (!response.ok) {
			throw new EmbedError(`tei_http_${response.status}`, response.status);
		}
		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new EmbedError('tei_bad_answer');
		}
		if (!Array.isArray(payload)) throw new EmbedError('tei_bad_answer');
		if (payload.length !== inputs.length) throw new EmbedError('tei_bad_count');
		return { vectors: this.vectorsOf(payload), status: response.status };
	}

	/** The vectors of an answer: the numbers, and nothing else. */
	private vectorsOf(payload: unknown[]): number[][] {
		return payload.map((vector) => {
			if (!Array.isArray(vector) || vector.length !== EMBED_DIMS) throw new EmbedError('tei_bad_dims');
			return vector.map((value) => {
				const number = typeof value === 'number' ? value : Number(value);
				if (!Number.isFinite(number)) throw new EmbedError('tei_bad_value');
				return number;
			});
		});
	}
}
