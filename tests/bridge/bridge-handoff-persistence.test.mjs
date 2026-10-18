/* Sign-in must not mint a session on a workspace BaaS does not hold. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv, consumeHandoffToken, createBridgeHandoff, validateBridgePayload } from '../../scripts/bridge-api.mjs';

const subject = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
const payload = validateBridgePayload({ provider: 'prismatica', subject, email: 'owner@example.com', name: 'Owner', jti: '1c76c7f0-f07e-442d-96fd-77d601764c3b' });
const persistedId = 'ac47a462-a784-59cb-aa8d-c87a7251be1e';
const now = 1_768_000_000_000;
const base = {
	OSIONOS_APP_URL: 'http://localhost:3001',
	OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
	OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
};
const baasConfig = (extra = {}) => configFromEnv({ ...base, OSIONOS_BAAS_URL: 'http://baas.local', KONG_SERVICE_API_KEY: 'service-role-test-key', OSIONOS_BRIDGE_PERSISTENCE: 'baas', ...extra });
const upsertUrl = /osionos_bridge_upsert_workspace/;
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const upsertRow = () => json([{ workspace_id: persistedId, workspace_name: "Owner's osionos", workspace_slug: 'owner-osionos' }]);

// Answers the upsert from `upserts` in order; every other BaaS call gets an empty list.
function fetchWith(upserts) {
	const calls = { upsert: 0 };
	const fetchImpl = async (url, init) => {
		if (!upsertUrl.test(String(url))) return json([]);
		const answer = upserts[calls.upsert++];
		return typeof answer === 'function' ? answer(init) : answer;
	};
	return { fetchImpl, calls };
}

async function handoff(config, fetchImpl) {
	const handoffStore = new Map();
	await createBridgeHandoff({ payload, config, handoffStore, now, fetchImpl });
	const [token] = handoffStore.keys();
	return { store: handoffStore, session: consumeHandoffToken(token, handoffStore, now + 1000).session };
}

describe('bridge handoff with BaaS persistence', () => {
	it('retries a failed upsert once and carries the persisted workspace id', async () => {
		const { fetchImpl, calls } = fetchWith([new Response('cold', { status: 502 }), upsertRow()]);
		const { session } = await handoff(baasConfig(), fetchImpl);
		assert.equal(calls.upsert, 2);
		assert.equal(session.privateWorkspaces[0]._id, persistedId);
	});

	for (const requireBaas of [false, true]) {
		it(`rejects with 503 and no session when the upsert fails twice (requireBaas=${requireBaas})`, async () => {
			const { fetchImpl, calls } = fetchWith([new Response('x', { status: 502 }), new Response('x', { status: 502 })]);
			const handoffStore = new Map();
			const config = baasConfig(requireBaas ? { OSIONOS_BRIDGE_REQUIRE_BAAS: 'true' } : {});
			await assert.rejects(
				() => createBridgeHandoff({ payload, config, handoffStore, now, fetchImpl }),
				(error) => error.status === 503 && /try again/.test(error.message),
			);
			assert.equal(calls.upsert, 2);
			assert.equal(handoffStore.size, 0);
		});
	}

	it('rejects when the upsert answers without a workspace row', async () => {
		const { fetchImpl } = fetchWith([json([]), json([])]);
		await assert.rejects(() => handoff(baasConfig(), fetchImpl), (error) => error.status === 503);
	});

	it('keeps the hash-derived fallback session when persistence is disabled', async () => {
		const config = configFromEnv({ ...base, OSIONOS_BRIDGE_PERSISTENCE: 'memory' });
		const { session } = await handoff(config, async () => { throw new Error('no BaaS expected'); });
		assert.match(session.privateWorkspaces[0]._id, /^[0-9a-f-]{36}$/);
		assert.notEqual(session.privateWorkspaces[0]._id, persistedId);
	});

	it('lets a cold call slower than the old 2.5 s budget finish', async (t) => {
		t.mock.timers.enable({ apis: ['setTimeout'] });
		const slow = (init) => new Promise((resolve, reject) => {
			init.signal.addEventListener('abort', () => reject(new Error('This operation was aborted')));
			setTimeout(() => resolve(upsertRow()), 3_700);
		});
		const { fetchImpl, calls } = fetchWith([slow]);
		const pending = handoff(baasConfig(), fetchImpl);
		for (let i = 0; i < 5; i++) { await Promise.resolve(); t.mock.timers.tick(1_000); await new Promise((r) => setImmediate(r)); }
		const { session } = await pending;
		assert.equal(calls.upsert, 1);
		assert.equal(session.privateWorkspaces[0]._id, persistedId);
	});
});
