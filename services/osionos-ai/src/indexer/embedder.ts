/**
 * The embedding client: the local text-embeddings-inference service.
 *
 * The service is the one the deployment runs next to the app (OSIONOS_AI_EMBED_URL):
 * nothing leaves the machine. The model is multilingual-e5, and that model
 * NEEDS its prefixes: a passage is embedded as "passage: …" and a query as
 * "query: …". An input without its prefix is embedded in the wrong space, and
 * the retrieval then answers with the neighbours of nothing.
 */

/** The configuration of the client. */
export interface EmbedderOptions {
	/** The base URL of the embedding service: OSIONOS_AI_EMBED_URL. */
	baseUrl: string;
	/** The name of the model the service loads: OSIONOS_AI_EMBED_MODEL. */
	model: string;
}

/** The size of the vectors: the model is a 384-dimension one. */
export const EMBED_DIMS = 384;

/** The number of inputs of one call: the service is happier in batches. */
export const EMBED_BATCH_SIZE = 32;

/** The timeout of one call. */
export const EMBED_TIMEOUT_MS = 30_000;

/** The prefix of a passage: multilingual-e5 needs it. */
export const PASSAGE_PREFIX = 'passage: ';

/** The prefix of a query: multilingual-e5 needs it. */
export const QUERY_PREFIX = 'query: ';

/**
 * The client of the embedding service.
 *
 * The errors it throws carry a code and never the text that was embedded: the
 * message of a failure ends up in the queue, and the queue is read by humans.
 */
export class Embedder {
	private readonly baseUrl: string;

	/** The name of the model: the chunks carry it, so a change is visible. */
	readonly model: string;

	constructor(options: EmbedderOptions) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, '');
		this.model = options.model;
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
	 * The inputs are sent in batches: the service takes thirty-two of them at
	 * a time, and one call of thirty-two is one round trip.
	 */
	async embed(inputs: readonly string[]): Promise<number[][]> {
		const vectors: number[][] = [];
		for (let index = 0; index < inputs.length; index += EMBED_BATCH_SIZE) {
			const batch = inputs.slice(index, index + EMBED_BATCH_SIZE);
			vectors.push(...(await this.embedBatch(batch)));
		}
		return vectors;
	}

	/** One call to the service: the batch in, the vectors out. */
	private async embedBatch(inputs: readonly string[]): Promise<number[][]> {
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
		} catch {
			// The service is down, or too slow: the reason is the same for the
			// worker, which retries with a backoff.
			throw new Error('tei_unreachable');
		}
		if (!response.ok) {
			throw new Error(`tei_http_${response.status}`);
		}
		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new Error('tei_bad_answer');
		}
		if (!Array.isArray(payload)) throw new Error('tei_bad_answer');
		if (payload.length !== inputs.length) throw new Error('tei_bad_count');
		return payload.map((vector) => {
			if (!Array.isArray(vector) || vector.length !== EMBED_DIMS) throw new Error('tei_bad_dims');
			return vector.map((value) => {
				const number = typeof value === 'number' ? value : Number(value);
				if (!Number.isFinite(number)) throw new Error('tei_bad_value');
				return number;
			});
		});
	}
}
