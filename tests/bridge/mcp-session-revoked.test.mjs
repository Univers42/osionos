/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mcp-session-revoked.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * C128: the MCP stdio server survives a revoked session.
 *
 * The user was signed out of every device, so the token the server cached is
 * over: the API answers 401 session_revoked. The server drops the session, mints
 * a new one and makes the call again -- ONCE. A second refusal surfaces.
 *
 * The client is a module of its own (scripts/osionos-mcp-api.mjs) so it can be
 * driven here with a fake fetch: the MCP server itself starts its stdio
 * transport on import.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createMcpApiClient } from '../../scripts/osionos-mcp-api.mjs';

const API = 'http://api.test';
const PATH = '/api/pages';

// The environment token short-circuits the mint: the test mints, so it is removed
// (and put back) around every case.
const savedJwt = process.env.OSIONOS_MCP_JWT;
delete process.env.OSIONOS_MCP_JWT;
test.after(() => {
	if (savedJwt === undefined) delete process.env.OSIONOS_MCP_JWT;
	else process.env.OSIONOS_MCP_JWT = savedJwt;
});

/** A client whose API answers `refusals` times with a revoked session, then works. */
function client(refusals) {
	const calls = [];
	const mints = [];
	const fetchImpl = async (url) => {
		calls.push(String(url));
		const apiCalls = calls.filter((one) => one.endsWith(PATH)).length;
		if (apiCalls <= refusals) {
			return new Response(JSON.stringify({ ok: false, code: 'session_revoked', error: { code: 'session_revoked' } }), {
				status: 401,
				headers: { 'content-type': 'application/json' },
			});
		}
		return new Response(JSON.stringify({ pages: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
	};
	const api = createMcpApiClient({
		fetchImpl,
		resolveApiUrl: async () => API,
		mintSession: async () => {
			mints.push(mints.length + 1);
			return { accessToken: `token-${mints.length}`, expiresAt: Date.now() + 600_000 };
		},
	});
	return { api, calls, mints };
}

test('a revoked session is dropped, minted again once, and the retry succeeds', async () => {
	const { api, calls, mints } = client(1);
	const answer = await api.request(PATH);
	assert.deepEqual(answer, { pages: [] });
	assert.equal(calls.filter((one) => one.endsWith(PATH)).length, 2, 'the call is made twice');
	assert.equal(mints.length, 2, 'the session is minted once more');
	assert.equal(calls.at(-1), `${API}${PATH}`);
});

test('two refusals in a row surface the error, after two calls and two mints', async () => {
	const { api, calls, mints } = client(2);
	await assert.rejects(() => api.request(PATH), (error) => {
		assert.equal(error.status, 401);
		assert.equal(error.body.code, 'session_revoked');
		return true;
	});
	assert.equal(calls.filter((one) => one.endsWith(PATH)).length, 2, 'the call is made twice, never more');
	assert.equal(mints.length, 2, 'the session is minted once more, never more');
});

test('a refusal that is not a revocation is not retried', async () => {
	const calls = [];
	const fetchImpl = async (url) => {
		calls.push(String(url));
		return new Response(JSON.stringify({ ok: false, code: 'unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json' },
		});
	};
	const api = createMcpApiClient({
		fetchImpl,
		resolveApiUrl: async () => API,
		mintSession: async () => ({ accessToken: 'token-1', expiresAt: Date.now() + 600_000 }),
	});
	await assert.rejects(() => api.request(PATH), /HTTP 401/);
	assert.equal(calls.length, 1, 'an expired token is not a revocation');
});
