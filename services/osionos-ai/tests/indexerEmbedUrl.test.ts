import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Embedder } from '../src/indexer/embedder.ts';
import { bulkEmbedUrl } from '../src/indexer/embedUrl.ts';
import { startMockEmbedder } from './mockEmbed.ts';

/**
 * The embedder of the indexer: the bulk service when the deployment runs one,
 * the query service otherwise.
 *
 * The mock is a real HTTP service on a port of the loopback: the test counts
 * the calls each of the two mocks received, so it shows WHERE the request
 * went, not only what the resolver returned.
 */

const MODEL = 'intfloat/multilingual-e5-small';

describe('the embedder the indexer asks', () => {
	it('asks the bulk service when there is one', () => {
		assert.equal(
			bulkEmbedUrl({
				OSIONOS_AI_EMBED_URL: 'http://query:80',
				OSIONOS_AI_EMBED_BULK_URL: 'http://bulk:80',
			}),
			'http://bulk:80',
		);
	});

	it('asks the query service when there is no bulk service', () => {
		assert.equal(bulkEmbedUrl({ OSIONOS_AI_EMBED_URL: 'http://query:80' }), 'http://query:80');
		// A variable that holds only spaces is no URL.
		assert.equal(
			bulkEmbedUrl({ OSIONOS_AI_EMBED_URL: 'http://query:80', OSIONOS_AI_EMBED_BULK_URL: '  ' }),
			'http://query:80',
		);
		assert.equal(
			bulkEmbedUrl({ OSIONOS_AI_EMBED_URL: 'http://query:80', OSIONOS_AI_EMBED_BULK_URL: '' }),
			'http://query:80',
		);
	});

	it('has no service at all when neither is set: the indexer refuses to start', () => {
		assert.equal(bulkEmbedUrl({}), '');
	});

	it('sends the chunks of the indexer to the bulk service, and to the query service otherwise', async () => {
		const query = await startMockEmbedder();
		const bulk = await startMockEmbedder();
		try {
			const withBulk = new Embedder({
				baseUrl: bulkEmbedUrl({
					OSIONOS_AI_EMBED_URL: query.baseUrl,
					OSIONOS_AI_EMBED_BULK_URL: bulk.baseUrl,
				}),
				model: MODEL,
			});
			assert.equal(withBulk.baseUrl, bulk.baseUrl);
			await withBulk.embed([withBulk.passageInput('a heading', 'a chunk')]);
			assert.equal(bulk.calls, 1);
			assert.equal(query.calls, 0);

			const withoutBulk = new Embedder({
				baseUrl: bulkEmbedUrl({ OSIONOS_AI_EMBED_URL: query.baseUrl }),
				model: MODEL,
			});
			assert.equal(withoutBulk.baseUrl, query.baseUrl);
			await withoutBulk.embed([withoutBulk.passageInput('a heading', 'a chunk')]);
			assert.equal(query.calls, 1);
			assert.equal(bulk.calls, 1);
		} finally {
			await query.close();
			await bulk.close();
		}
	});
});
