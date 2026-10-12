// Pins the adapter-registry timeout: a registry that never answers is a 503
// (engine offline), not a bridge 500 "This operation was aborted".
// Caveat: the stub fetch only honours AbortSignal; a real socket also needs the
// kernel to deliver the abort, which this does not exercise.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baasRegistryGet } from './bridge-api.mjs';

const config = { adapterRegistryUrl: 'http://registry.test', serviceKey: 'k' };

test('a registry that never answers becomes a 503, not a 500', async () => {
	const hangs = (_url, { signal }) => new Promise((_, reject) => {
		signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
	});
	await assert.rejects(baasRegistryGet(config, hangs, '/databases', 't1', 20), (error) => {
		assert.equal(error.status, 503);
		assert.match(error.message, /adapter-registry did not answer within 20 ms/);
		return true;
	});
});

test('a refused registry connection becomes a 503', async () => {
	const refused = async () => { throw new TypeError('fetch failed'); };
	await assert.rejects(baasRegistryGet(config, refused, '/databases', 't1', 20), { status: 503 });
});

test('a registry that answers passes its rows through', async () => {
	const ok = async () => new Response('[{"name":"a"}]', { status: 200 });
	assert.deepEqual(await baasRegistryGet(config, ok, '/databases', 't1', 20), [{ name: 'a' }]);
});
