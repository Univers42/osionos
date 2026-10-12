import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { publishRealtime } from '../../scripts/bridge-social-core.mjs';

// A fetch that records its one call and answers with `reply` (or throws it when an Error).
function recorder(reply = { ok: true, status: 200 }) {
	const calls = [];
	const fetchImpl = async (url, init) => {
		calls.push({ url, init });
		if (reply instanceof Error) throw reply;
		return reply;
	};
	return { calls, fetchImpl };
}

const event = { topic: 'chat:1', eventType: 'message_created', payload: { n: 1 } };

// Captures console.warn for one async call, so a test can prove a secret never reaches the log.
async function warnings(fn) {
	const lines = [];
	const original = console.warn;
	console.warn = (...args) => lines.push(args.join(' '));
	try {
		return { result: await fn(), lines };
	} finally {
		console.warn = original;
	}
}

describe('publishRealtime', () => {
	it('defaults to the gateway by name, with no apikey', async () => {
		const { calls, fetchImpl } = recorder();
		assert.equal(await publishRealtime({ ...event, fetchImpl, env: {} }), true);
		assert.equal(calls[0].url, 'http://mini-baas-realtime:4000/v1/publish');
		assert.equal(calls[0].init.method, 'POST');
		assert.deepEqual(JSON.parse(calls[0].init.body), { topic: 'chat:1', event_type: 'message_created', payload: { n: 1 } });
		assert.equal('apikey' in calls[0].init.headers, false);
	});

	it('through the edge: strips one trailing slash and presents REALTIME_PUBLISH_APIKEY', async () => {
		const { calls, fetchImpl } = recorder();
		const env = { REALTIME_PUBLISH_URL: 'http://mini-baas-kong:8000/realtime/', REALTIME_PUBLISH_APIKEY: 'k-123' };
		assert.equal(await publishRealtime({ ...event, fetchImpl, env }), true);
		assert.equal(calls[0].url, 'http://mini-baas-kong:8000/realtime/v1/publish');
		assert.equal(calls[0].init.headers.apikey, 'k-123');
	});

	it('an empty URL or a blank key falls back to the defaults', async () => {
		const { calls, fetchImpl } = recorder();
		await publishRealtime({ ...event, fetchImpl, env: { REALTIME_PUBLISH_URL: '', REALTIME_PUBLISH_APIKEY: '   ' } });
		assert.equal(calls[0].url, 'http://mini-baas-realtime:4000/v1/publish');
		assert.equal('apikey' in calls[0].init.headers, false);
	});

	it('a refusal or a network error returns false, never throws, never logs the key', async () => {
		const env = { REALTIME_PUBLISH_URL: 'http://mini-baas-kong:8000/realtime', REALTIME_PUBLISH_APIKEY: 'k-123' };
		for (const reply of [{ ok: false, status: 403 }, new Error('connect ECONNREFUSED')]) {
			const { fetchImpl } = recorder(reply);
			const { result, lines } = await warnings(() => publishRealtime({ ...event, fetchImpl, env }));
			assert.equal(result, false);
			assert.equal(lines.length, 1);
			assert.equal(lines[0].includes('k-123'), false);
		}
	});
});
