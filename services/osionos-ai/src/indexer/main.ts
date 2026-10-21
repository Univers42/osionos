/**
 * The indexer: the second entrypoint of the osionos-ai image.
 *
 * It runs the same image as the service, with another command, and N replicas
 * of it are safe: the queue is claimed with SKIP LOCKED and every page is
 * taken with an advisory lock.
 *
 * The environment:
 *   OSIONOS_AI_DATABASE_URL  the database of the service (the queue is there)
 *   OSIONOS_AI_EMBED_URL     the embedding service (the local TEI)
 *   OSIONOS_AI_EMBED_MODEL   the model the service loads; it is written on
 *                            every chunk, so a change of model is visible
 */

import { createPool } from '../db.ts';
import { Embedder } from './embedder.ts';
import { IndexerWorker } from './worker.ts';

const databaseUrl = process.env.OSIONOS_AI_DATABASE_URL ?? '';
const embedUrl = process.env.OSIONOS_AI_EMBED_URL ?? '';
const embedModel = process.env.OSIONOS_AI_EMBED_MODEL ?? 'intfloat/multilingual-e5-small';

if (databaseUrl.length === 0 || embedUrl.length === 0) {
	// The names only: a URL may hold a password.
	console.error(
		`[osionos-ai-indexer] refusing to start: invalid environment variables: ${
			databaseUrl.length === 0 ? 'OSIONOS_AI_DATABASE_URL' : 'OSIONOS_AI_EMBED_URL'
		}`,
	);
	process.exit(1);
}

const pool = createPool(databaseUrl);
const embedder = new Embedder({ baseUrl: embedUrl, model: embedModel });
const worker = new IndexerWorker({ pool, embedder, databaseUrl });

await worker.start();
console.log(JSON.stringify({ event: 'indexer_started', model: embedModel }));

/** The stop: the page that is being indexed is finished, then the process ends. */
async function shutdown(): Promise<void> {
	await worker.stop();
	await pool.end();
	process.exit(0);
}

process.on('SIGTERM', () => {
	void shutdown();
});
process.on('SIGINT', () => {
	void shutdown();
});
