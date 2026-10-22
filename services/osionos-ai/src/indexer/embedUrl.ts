/**
 * The embedder the INDEXER asks, and the one the QUERY asks.
 *
 * The AI plane has two very different jobs for the embedding service:
 *   - the QUERY: the embedding of one question, the one the retrieval asks
 *     for. A person waits for it.
 *   - the BULK: the embedding of the chunks of a backfill, thousands of them.
 *     Nobody waits for it — but it fills the service.
 *
 * One service for the two is what made the p95 of an interactive query go from
 * 147 ms to 864 ms during a backfill: the service answers the calls in the
 * order it received them, so a query that lands during a call of thirty-two
 * inputs waits for the whole call (measured:
 * services/osionos-ai/spikes/indexer/RESULTS.md).
 *
 * So the indexer asks its OWN service when the deployment runs one:
 *   OSIONOS_AI_EMBED_BULK_URL  the bulk embedder (the second
 *                               text-embeddings-inference, the one the CPU
 *                               is split for)
 *   OSIONOS_AI_EMBED_URL       the query embedder — the FALLBACK of the
 *                               indexer, so an operator who sets nothing
 *                               keeps the service it had
 *
 * Two instances of the SAME model, never two models: the vectors of the bulk
 * and of the query have to live in the same space, or the search answers with
 * the neighbours of nothing.
 */

/** The environment the indexer reads its names from. */
export type EmbedEnv = Record<string, string | undefined>;

/**
 * The URL of the embedder the indexer asks.
 *
 * The bulk one when there is one, the query one otherwise. An empty string
 * when there is neither: the indexer then refuses to start, and it names the
 * variables it needed.
 *
 * The value is trimmed: a variable that holds only spaces is no URL.
 */
export function bulkEmbedUrl(env: EmbedEnv = process.env): string {
	const bulk = (env.OSIONOS_AI_EMBED_BULK_URL ?? '').trim();
	if (bulk.length > 0) return bulk;
	return (env.OSIONOS_AI_EMBED_URL ?? '').trim();
}
