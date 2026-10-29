// The browser preflights every cross-origin write. A method or header the shared OPTIONS answer
// does not list is refused by the browser before the bridge sees the request, so the profile
// save (If-Match) and the attribute/personalization writes (PUT) die silently in the client.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { withBridge } from './support/bridge-harness.mjs';
import { backend, config, world } from './support/workspace-invites-backend.mjs';

const listed = (value) => String(value ?? '').toLowerCase().split(',').map((item) => item.trim());

describe('the shared CORS preflight', () => {
	it('allows PUT PATCH and the If-Match header', async () => {
		const mock = backend({ seed: world() });
		const result = await withBridge(config, mock.fetchImpl, (base) => fetch(`${base}/api/account/profile`, {
			method: 'OPTIONS',
			headers: { origin: config.allowedOrigin, 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'if-match' },
		}));
		assert.equal(result.status, 204);
		assert.equal(result.headers.get('access-control-allow-origin'), config.allowedOrigin);
		assert.ok(listed(result.headers.get('access-control-allow-headers')).includes('if-match'));
		assert.ok(listed(result.headers.get('access-control-allow-methods')).includes('put'));
		assert.ok(listed(result.headers.get('access-control-allow-methods')).includes('patch'));
	});
});
