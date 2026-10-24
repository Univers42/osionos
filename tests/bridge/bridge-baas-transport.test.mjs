import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { bundledAgentClass, createBaasTransport } from '../../scripts/bridge-baas-transport.mjs';

const BAAS = 'http://baas.test:8000';

class FakeAgent {
	constructor(options) {
		this.options = options;
		this.closed = false;
	}
	async close() {
		this.closed = true;
		throw new Error('already closed');
	}
}

function harness(overrides = {}) {
	mock.timers.enable({ apis: ['setInterval'] });
	const calls = [];
	const logs = [];
	const state = { fail: false };
	const fetchImpl = async (input, init) => {
		calls.push({ input, init });
		if (state.fail && String(input).endsWith('/waf-health')) throw new Error('relay down');
		return new Response('ok');
	};
	const transport = createBaasTransport({
		baasUrl: BAAS,
		fetchImpl,
		pingEveryMs: 1000,
		resolveAgentClass: () => FakeAgent,
		log: (line) => logs.push(line),
		...overrides,
	});
	const tick = async (ms) => {
		mock.timers.tick(ms);
		await new Promise((resolve) => setImmediate(resolve));
	};
	return { calls, logs, state, transport, tick };
}

test('baas URL gets the dispatcher and keeps the caller init', async (t) => {
	t.after(() => mock.timers.reset());
	const { calls, transport } = harness();
	const signal = new AbortController().signal;
	await transport.fetch(`${BAAS}/rest/v1/x`, { method: 'POST', signal });
	assert.ok(calls[0].init.dispatcher instanceof FakeAgent);
	assert.equal(calls[0].init.method, 'POST');
	assert.equal(calls[0].init.signal, signal);
	assert.deepEqual(calls[0].init.dispatcher.options, { keepAliveTimeout: 50_000, keepAliveMaxTimeout: 50_000 });
	transport.close();
});

test('a lookalike origin and an unparsable input get no dispatcher', async (t) => {
	t.after(() => mock.timers.reset());
	const { calls, transport } = harness();
	await transport.fetch('http://baas.test:8000.evil.net/x', {});
	await transport.fetch('http://baas.test:8001/x', {});
	await transport.fetch('not a url', {});
	for (const call of calls) assert.equal(call.init.dispatcher, undefined);
	transport.close();
});

test('a non-baas URL is passed through untouched', async (t) => {
	t.after(() => mock.timers.reset());
	const { calls, transport } = harness();
	const init = { method: 'GET' };
	await transport.fetch('https://other.test/x', init);
	assert.equal(calls[0].init, init);
	transport.close();
});

test('no agent class falls back to the given fetch with one log line', () => {
	const logs = [];
	const fetchImpl = async () => new Response('');
	const transport = createBaasTransport({ baasUrl: BAAS, fetchImpl, resolveAgentClass: () => null, log: (line) => logs.push(line) });
	assert.equal(transport.fetch, fetchImpl);
	assert.equal(logs.length, 1);
	assert.match(logs[0], /^\[osionos-bridge\] baas keep-alive unavailable: /);
	transport.close();
});

test('a throwing constructor and a missing baasUrl also fall back', () => {
	const fetchImpl = async () => new Response('');
	const logs = [];
	const Boom = class { constructor() { throw new Error('nope'); } };
	assert.equal(createBaasTransport({ baasUrl: BAAS, fetchImpl, resolveAgentClass: () => Boom, log: (l) => logs.push(l) }).fetch, fetchImpl);
	assert.equal(createBaasTransport({ baasUrl: '', fetchImpl, log: (l) => logs.push(l) }).fetch, fetchImpl);
	assert.equal(logs.length, 2);
});

test('each tick pings with the dispatcher and a timeout signal', async (t) => {
	t.after(() => mock.timers.reset());
	const { calls, transport, tick } = harness();
	await tick(1000);
	assert.equal(calls.length, 2);
	for (const call of calls) {
		assert.equal(call.input, `${BAAS}/waf-health`);
		assert.ok(call.init.dispatcher instanceof FakeAgent);
		assert.ok(call.init.signal instanceof AbortSignal);
	}
	transport.close();
});

test('the idle tick dispatches every warm ping before any resolves', async (t) => {
	t.after(() => mock.timers.reset());
	let started = 0;
	const releases = [];
	const fetchImpl = (input) => {
		started += 1;
		return new Promise((resolve) => releases.push(() => resolve(new Response('ok'))));
	};
	const { transport, tick } = harness({ fetchImpl, warmConnections: 3 });
	await tick(1000);
	assert.equal(started, 3);
	releases.forEach((release) => release());
	transport.close();
});

test('real calls do not suppress the tick', async (t) => {
	t.after(() => mock.timers.reset());
	const { calls, transport, tick } = harness();
	await tick(500);
	await transport.fetch(`${BAAS}/rest/v1/x`, {});
	await tick(500);
	assert.equal(calls.length, 3);
	await tick(1000);
	assert.equal(calls.length, 5);
	transport.close();
});

test('ping failures log once per run and once on recovery, never throw', async (t) => {
	t.after(() => mock.timers.reset());
	const { logs, state, transport, tick } = harness();
	state.fail = true;
	await tick(1000);
	await tick(1000);
	await tick(1000);
	assert.equal(logs.length, 1);
	state.fail = false;
	await tick(1000);
	assert.equal(logs.length, 2);
	await tick(1000);
	assert.equal(logs.length, 2);
	transport.close();
});

test('close stops pings and swallows the agent close rejection', async (t) => {
	t.after(() => mock.timers.reset());
	const { calls, transport, tick } = harness();
	transport.close();
	await tick(5000);
	assert.equal(calls.length, 0);
});

test('canary: the real Node runtime exposes a usable bundled Agent class', async () => {
	const AgentClass = bundledAgentClass();
	assert.equal(typeof AgentClass, 'function');
	const agent = new AgentClass({ keepAliveTimeout: 1000, keepAliveMaxTimeout: 1000 });
	assert.equal(typeof agent.dispatch, 'function');
	assert.equal(typeof agent.close, 'function');
	await agent.close();
});
