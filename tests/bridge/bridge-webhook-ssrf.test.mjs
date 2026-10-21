/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-webhook-ssrf.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The automation webhook POSTs to a host the database rule names: it must
// only ever connect to a PUBLIC address, and it must never follow a redirect
// (fetch's default `redirect: 'follow'` would walk a 30x into the private
// network, and fetch resolves the name again on the way).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { handleAutomationWebhook } from '../../scripts/bridge-automations-webhook.mjs';
import { signAppSessionToken, verifyAppSessionToken } from '../../scripts/bridge-api.mjs';

const CONFIG = {
	allowedOrigin: 'https://localhost:3001',
	appSessionSecret: 'test-app-session-secret-that-is-long-enough',
	sessionTtlSeconds: 3600,
};
const USER = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
const WORKSPACE = '1cc0693b-59dd-4d51-86d9-de86d088f9df';

/** A response double that records what the handler answered. */
function fakeResponse() {
	const state = { status: 0, headers: {}, body: null };
	return {
		state,
		writeHead(status, headers) {
			state.status = status;
			state.headers = headers;
		},
		end(payload) {
			state.body = payload ? JSON.parse(payload) : null;
		},
	};
}

/** A request double: the bearer token and a JSON body. */
function fakeRequest(body) {
	const token = signAppSessionToken({ payload: { subject: USER, provider: 'test' }, workspace: { _id: WORKSPACE }, config: CONFIG }).token;
	return {
		headers: { authorization: `Bearer ${token}` },
		async *[Symbol.asyncIterator]() {
			yield JSON.stringify(body);
		},
	};
}

/** A canned upstream response. */
function upstreamResponse(route) {
	const status = route.status ?? 200;
	const body = Buffer.from(route.body ?? '');
	return {
		status,
		ok: status >= 200 && status < 300,
		headers: route.headers ?? {},
		body,
		text: () => body.toString('utf8'),
	};
}

/** Resolve a host the way a socket does — through the guarded lookup. */
function connectTo(hostname, lookup) {
	return new Promise((resolve, reject) => {
		lookup(hostname, { family: 0, hints: 0 }, (error, address, family) => {
			if (error) reject(error);
			else resolve({ address, family });
		});
	});
}

/**
 * A transport double: it connects first (so the guarded lookup runs exactly
 * like it would on a real socket) and only then serves the canned answer.
 */
function fakeTransport(routes, seen = []) {
	return async (url, options = {}) => {
		seen.push({ url: url.toString(), method: options.method, headers: options.headers, body: options.body });
		if (options.lookup) await connectTo(url.hostname, options.lookup);
		const route = routes[url.toString()];
		if (!route) throw new Error(`no canned route for ${url}`);
		return upstreamResponse(route);
	};
}

/** Call the handler and return the error it threw (null when it answered). */
async function webhookError(body, deps = {}) {
	try {
		await handleAutomationWebhook({ verifySession: verifyAppSessionToken, ...deps }, fakeRequest(body), fakeResponse(), CONFIG);
		return null;
	} catch (error) {
		return error;
	}
}

/** Call the handler and return what it answered. */
async function webhook(body, deps = {}) {
	const response = fakeResponse();
	await handleAutomationWebhook({ verifySession: verifyAppSessionToken, ...deps }, fakeRequest(body), response, CONFIG);
	return response.state;
}

describe('automation webhook — SSRF guard', () => {
	it('posts the JSON body to a public host', async () => {
		const seen = [];
		const transport = fakeTransport({ 'https://93.184.216.34/hook': { status: 200 } }, seen);
		const answer = await webhook({ url: 'https://93.184.216.34/hook', payload: { event: 'row.created', row: { id: 7 } } }, { webhookTransport: transport });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: true, status: 200 });
		assert.equal(seen.length, 1);
		assert.equal(seen[0].method, 'POST');
		assert.equal(seen[0].headers['content-type'], 'application/json');
		assert.deepEqual(JSON.parse(seen[0].body), { event: 'row.created', row: { id: 7 } });
	});

	it('answers the status of a failed delivery', async () => {
		const seen = [];
		const transport = fakeTransport({ 'https://93.184.216.34/hook': { status: 500 } }, seen);
		const answer = await webhook({ url: 'https://93.184.216.34/hook', payload: {} }, { webhookTransport: transport });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: false, status: 500 });
	});

	it('does not follow a redirect into the private network', async () => {
		const seen = [];
		const transport = fakeTransport({
			'https://93.184.216.34/hook': { status: 302, headers: { location: 'https://100.97.49.118/' } },
			'https://100.97.49.118/': { status: 200 },
		}, seen);
		const answer = await webhook({ url: 'https://93.184.216.34/hook', payload: {} }, { webhookTransport: transport });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body, { ok: false, status: 302 }, 'the 302 is the answer');
		assert.deepEqual(seen.map((request) => request.url), ['https://93.184.216.34/hook'], 'the redirect must not be followed');
	});

	it('refuses a host that rebinds to a private address between check and connect', async () => {
		let calls = 0;
		const resolveHost = async () => {
			calls += 1;
			return calls === 1
				? [{ address: '93.184.216.34', family: 4 }]
				: [{ address: '10.0.0.5', family: 4 }];
		};
		const seen = [];
		const transport = fakeTransport({ 'https://rebind.test/hook': { status: 200 } }, seen);
		const error = await webhookError({ url: 'https://rebind.test/hook', payload: {} }, { resolveHost, webhookTransport: transport });
		assert.equal(error?.status, 422, `expected 422, got ${error?.status}: ${error?.message}`);
		assert.match(error.message, /private address/);
		assert.equal(calls, 2, 'the check resolves once, the connect resolves again');
		assert.deepEqual(seen.map((request) => request.url), ['https://rebind.test/hook']);
	});

	it('refuses a private address before the request', async () => {
		const error = await webhookError({ url: 'https://100.97.49.118/hook', payload: {} }, {
			webhookTransport: async () => { throw new Error('the transport must not be reached'); },
		});
		assert.equal(error?.status, 422);
		assert.match(error.message, /private address/);
	});

	it('refuses a plain http endpoint and a host that is not allowed', async () => {
		const insecure = await webhookError({ url: 'http://93.184.216.34/hook', payload: {} }, {
			webhookTransport: async () => { throw new Error('the transport must not be reached'); },
		});
		assert.equal(insecure?.status, 422);
		assert.match(insecure.message, /https/);
		const internal = await webhookError({ url: 'https://tailnet.internal/hook', payload: {} }, {
			webhookTransport: async () => { throw new Error('the transport must not be reached'); },
		});
		assert.equal(internal?.status, 422);
	});

	it('answers 502 when the endpoint does not respond', async () => {
		const answer = await webhook({ url: 'https://93.184.216.34/hook', payload: {} }, {
			webhookTransport: async () => { throw new Error('ECONNRESET'); },
		});
		assert.equal(answer.status, 502);
		assert.deepEqual(answer.body, { ok: false, message: 'Webhook endpoint did not respond.' });
	});
});
