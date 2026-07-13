/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   runner.test.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createRunnerHandler } from '../../scripts/bridge-runner.mjs';

const config = { allowedOrigin: 'http://app' };
const RUNNER_ENV = { OSIONOS_RUNNER_URL: 'http://runner:7900' };

function mockResponse() {
	return {
		statusCode: 0, chunks: [], writableEnded: false,
		writeHead(s) { this.statusCode = s; return this; },
		write(c) { this.chunks.push(String(c)); return true; },
		end(p) { if (p) this.chunks.push(String(p)); this.writableEnded = true; },
	};
}
function mockRequest(method, { body, auth = 'Bearer t' } = {}) {
	const req = Readable.from(body != null ? [typeof body === 'string' ? body : JSON.stringify(body)] : []);
	req.method = method;
	req.headers = auth ? { authorization: auth } : {};
	req.socket = { remoteAddress: '1.2.3.4' };
	return req;
}
const okAuth = () => ({ userId: 'user-1' });
async function* sseChunks() {
	yield Buffer.from('event: stdout\ndata: {"chunk":"hi\\n"}\n\n');
	yield Buffer.from('event: exit\ndata: {"code":0}\n\n');
}

describe('bridge-runner — auth + double-gate + limits + SSE passthrough', () => {
	it('404s when OSIONOS_RUNNER_URL is unset — and authenticates NOTHING', async () => {
		let authed = false;
		const handler = createRunnerHandler({ config, verifySession: () => { authed = true; return okAuth(); }, fetchImpl: async () => { throw new Error('should not fetch'); }, env: {} });
		const res = mockResponse();
		const handled = await handler(new URL('http://app/api/ide/run'), mockRequest('POST', { body: { language: 'python', source: 'x' } }), res, config);
		assert.equal(handled, true);
		assert.equal(res.statusCode, 404);
		assert.equal(authed, false);
	});

	it('401s an unauthenticated run — and SPAWNS NOTHING (no upstream fetch)', async () => {
		let fetched = false;
		const handler = createRunnerHandler({ config, verifySession: () => { throw Object.assign(new Error('no'), { status: 401 }); }, fetchImpl: async () => { fetched = true; return { ok: true, body: sseChunks() }; }, env: RUNNER_ENV });
		const res = mockResponse();
		await handler(new URL('http://app/api/ide/run'), mockRequest('POST', { body: { language: 'python', source: 'x' }, auth: null }), res, config);
		assert.equal(res.statusCode, 401);
		assert.equal(fetched, false);
	});

	it('400s an unsupported language — no upstream fetch', async () => {
		let fetched = false;
		const handler = createRunnerHandler({ config, verifySession: okAuth, fetchImpl: async () => { fetched = true; return { ok: true, body: sseChunks() }; }, env: RUNNER_ENV });
		const res = mockResponse();
		await handler(new URL('http://app/api/ide/run'), mockRequest('POST', { body: { language: 'evil-lang', source: 'x' } }), res, config);
		assert.equal(res.statusCode, 400);
		assert.equal(fetched, false);
	});

	it('streams the runner SSE straight through on the happy path', async () => {
		let sent = null;
		const handler = createRunnerHandler({
			config, verifySession: okAuth,
			fetchImpl: async (u, opts) => { sent = JSON.parse(opts.body); return { ok: true, body: sseChunks() }; },
			env: RUNNER_ENV,
		});
		const res = mockResponse();
		await handler(new URL('http://app/api/ide/run'), mockRequest('POST', { body: { language: 'python', source: 'print(1)' } }), res, config);
		assert.equal(res.statusCode, 200);
		const out = res.chunks.join('');
		assert.match(out, /event: meta/);
		assert.match(out, /event: stdout/);
		assert.match(out, /event: exit/);
		assert.equal(res.writableEnded, true);
		assert.equal(sent.language, 'python');
		assert.equal(sent.source, 'print(1)');
	});

	it('falls through (returns false) on a non-runner route', async () => {
		const handler = createRunnerHandler({ config, verifySession: okAuth, fetchImpl: async () => ({ ok: true, body: sseChunks() }), env: RUNNER_ENV });
		const handled = await handler(new URL('http://app/api/pages'), mockRequest('POST', { body: {} }), mockResponse(), config);
		assert.equal(handled, false);
	});

	it('404s /api/ide/format when the runner is disabled', async () => {
		const handler = createRunnerHandler({ config, verifySession: okAuth, fetchImpl: async () => { throw new Error('should not fetch'); }, env: {} });
		const res = mockResponse();
		await handler(new URL('http://app/api/ide/format'), mockRequest('POST', { body: { language: 'python', source: 'x=1' } }), res, config);
		assert.equal(res.statusCode, 404);
	});

	it('proxies /api/ide/format to the runner and returns the formatted JSON', async () => {
		let sentUrl = null;
		const handler = createRunnerHandler({
			config, verifySession: okAuth,
			fetchImpl: async (u) => { sentUrl = String(u); return { ok: true, status: 200, text: async () => JSON.stringify({ formatted: 'x = 1\n' }) }; },
			env: RUNNER_ENV,
		});
		const res = mockResponse();
		await handler(new URL('http://app/api/ide/format'), mockRequest('POST', { body: { language: 'python', source: 'x=1' } }), res, config);
		assert.equal(res.statusCode, 200);
		assert.match(sentUrl, /\/format$/);
		assert.match(res.chunks.join(''), /"formatted":"x = 1/);
	});
});
