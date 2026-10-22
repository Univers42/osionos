import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { configFromEnv, createBridgeHandoff, validateBridgePayload } from '../../scripts/bridge-api.mjs';

const subject = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
const payload = validateBridgePayload({ provider: 'prismatica', subject, email: 'owner@example.com', name: 'Owner', jti: '1c76c7f0-f07e-442d-96fd-77d601764c3b' });
const persistedId = 'ac47a462-a784-59cb-aa8d-c87a7251be1e';
const base = {
  OSIONOS_APP_URL: 'http://localhost:3001',
  OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
  OSIONOS_APP_SESSION_SECRET: 'test-app-session-secret-that-is-long-enough',
};
const baasConfig = (extra = {}) => configFromEnv({ ...base, OSIONOS_BAAS_URL: 'http://baas.local', KONG_SERVICE_API_KEY: 'service-role-test-key', OSIONOS_BRIDGE_PERSISTENCE: 'baas', ...extra });

describe('bridge handoff iat order (C125)', () => {
  it('takes iat_ms (now) before reading the members rows', async () => {
    const order = [];
    const originalNow = Date.now;
    Date.now = () => { order.push('now'); return 1_768_000_000_000; };
    const upsertUrl = /osionos_bridge_upsert_workspace/;
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    const fetchImpl = async (url) => {
      order.push('fetch');
      if (upsertUrl.test(String(url))) return json([{ workspace_id: persistedId, workspace_name: "Owner's osionos", workspace_slug: 'owner-osionos' }]);
      return json([]);
    };
    const handoffStore = new Map();
    try {
      await createBridgeHandoff({ payload, config: baasConfig(), handoffStore, fetchImpl });
    } catch (e) {
      // ignore; ordering already recorded
    } finally {
      Date.now = originalNow;
    }
    assert.ok(order.includes('now'), 'Date.now was not called');
    assert.ok(order.includes('fetch'), 'members were not read');
    assert.ok(order.indexOf('now') < order.indexOf('fetch'), `now (${order.indexOf('now')}) must precede fetch (${order.indexOf('fetch')}): ${order.join(',')}`);
  });
});
