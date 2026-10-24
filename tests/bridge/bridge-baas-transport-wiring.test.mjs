import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv, createBridgeServer } from '../../scripts/bridge-api.mjs';

const BAAS = 'http://baas.local';

describe('BaaS transport wiring', () => {
	const saved = process.env.OSIONOS_BAAS_KEEPALIVE;
	const restore = () => {
		if (saved === undefined) delete process.env.OSIONOS_BAAS_KEEPALIVE;
		else process.env.OSIONOS_BAAS_KEEPALIVE = saved;
	};
	const config = configFromEnv({ OSIONOS_APP_URL: 'http://localhost:3001', OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough', OSIONOS_BAAS_URL: BAAS });
	const spy = () => {
		const seen = { created: 0, closed: 0, baasUrl: null };
		const createTransport = ({ baasUrl }) => {
			seen.created += 1;
			seen.baasUrl = baasUrl;
			return { fetch, close: () => { seen.closed += 1; } };
		};
		return { seen, createTransport };
	};

	it('opts in with OSIONOS_BAAS_KEEPALIVE=1 and closes the transport with the server', async (t) => {
		t.after(restore);
		process.env.OSIONOS_BAAS_KEEPALIVE = '1';
		const { seen, createTransport } = spy();
		const server = createBridgeServer({ config, createTransport });
		assert.equal(seen.created, 1);
		assert.equal(seen.baasUrl, config.baasUrl);
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		await new Promise((resolve) => server.close(resolve));
		assert.equal(seen.closed, 1);
	});

	for (const value of [undefined, '0']) {
		it(`creates no transport when OSIONOS_BAAS_KEEPALIVE is ${value ?? 'unset'}`, (t) => {
			t.after(restore);
			if (value === undefined) delete process.env.OSIONOS_BAAS_KEEPALIVE;
			else process.env.OSIONOS_BAAS_KEEPALIVE = value;
			const { seen, createTransport } = spy();
			createBridgeServer({ config, createTransport });
			assert.equal(seen.created, 0);
		});
	}

	it('creates no transport when a fetchImpl is injected', (t) => {
		t.after(restore);
		process.env.OSIONOS_BAAS_KEEPALIVE = '1';
		const { seen, createTransport } = spy();
		createBridgeServer({ config, createTransport, fetchImpl: async () => new Response('') });
		assert.equal(seen.created, 0);
	});
});
