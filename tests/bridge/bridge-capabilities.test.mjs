/**
 * GET /api/capabilities: the optional features this bridge serves, as one 200 (#293). The app
 * read "off" from each feature's own 404 (GET /api/recs/for-you on Home, GET
 * /api/account/published-pages in Settings), and Chrome logs every 404 as a console error.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAppSessionToken } from '../../scripts/bridge-api.mjs';
import { createCapabilitiesHandler } from '../../scripts/bridge-capabilities.mjs';
import { accountConfig, send, sessionToken, startBridgeWorld } from './support/account-world.mjs';
import { callRoute } from './support/route-call.mjs';

const PATH = '/api/capabilities';

function build(env = {}) {
	const config = accountConfig();
	const handler = createCapabilitiesHandler({ config, verifySession: verifyAppSessionToken, env });
	return {
		handler,
		get: (headers = { authorization: `Bearer ${sessionToken(config)}` }) => callRoute(handler, { method: 'GET', path: PATH, headers }),
	};
}

describe('GET /api/capabilities', () => {
	it('C1 answers 200 with each feature off when its flag is unset', async () => {
		const result = await build().get();
		assert.equal(result.status, 200);
		assert.deepEqual(result.body, { capabilities: { recs: false, publish: false } });
	});

	it('C2 reports a feature on only for the exact value its own route checks', async () => {
		assert.deepEqual((await build({ OSIONOS_RECS_FOR_YOU: '1', OSIONOS_PUBLISH_ENABLED: '1' }).get()).body, { capabilities: { recs: true, publish: true } });
		for (const value of ['true', '0', 'yes']) {
			assert.deepEqual((await build({ OSIONOS_RECS_FOR_YOU: value, OSIONOS_PUBLISH_ENABLED: value }).get()).body.capabilities, { recs: false, publish: false }, value);
		}
	});

	it('C3 needs a session: a caller without one cannot tell an off feature from a missing route', async () => {
		const result = await build({ OSIONOS_RECS_FOR_YOU: '1' }).get({ authorization: '' });
		assert.equal(result.status, 401);
		assert.equal(result.text.includes('recs'), false);
	});

	it('C4 is GET only and leaves every other path alone', async () => {
		const { handler } = build();
		const config = accountConfig();
		const post = await callRoute(handler, { method: 'POST', path: PATH, headers: { authorization: `Bearer ${sessionToken(config)}` } });
		assert.equal(post.status, 405);
		assert.equal((await callRoute(handler, { method: 'GET', path: '/api/capabilities/x' })).handled, false);
	});
});

describe('the bridge serves GET /api/capabilities', () => {
	it('C5 answers through the real dispatch', async (t) => {
		const { base, config } = await startBridgeWorld(t);
		const response = await send(base, PATH, { token: sessionToken(config) });
		assert.equal(response.status, 200);
		assert.deepEqual(Object.keys(response.body.capabilities).sort(), ['publish', 'recs']);
	});
});
