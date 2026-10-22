/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-budgets.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Resource budgets: wall-clock deadlines, decoded-byte caps and the in-flight limit.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

import { createFetchContext, safeFetch } from '../../scripts/bridge-unfurl-net.mjs';
import { createUnfurler } from '../../scripts/bridge-unfurl-core.mjs';
import { loopbackNet, sendHtml, startServer } from './bridge-unfurl-helpers.mjs';

const status = (code) => (error) => error.status === code;
const nextTick = () => new Promise((resolve) => setImmediate(resolve));

describe('budgets', () => {
	const named = (port, limits) => loopbackNet({ ports: [port], names: { 'public.test': ['127.0.0.1'] }, limits });

	it('cuts a 1 byte/s drip server within 6.5 s', async () => {
		const target = await startServer((_request, response) => {
			response.writeHead(200, { 'content-type': 'text/html' });
			const timer = setInterval(() => response.write('x'), 1000);
			response.on('close', () => clearInterval(timer));
		});
		after(target.close);
		const unfurler = createUnfurler({ netOptions: named(target.port).options });
		const started = performance.now();
		await assert.rejects(unfurler.resolve(`http://public.test:${target.port}/`), status(504));
		const elapsed = performance.now() - started;
		assert.ok(elapsed <= 6500, `took ${Math.round(elapsed)} ms`);
		assert.ok(elapsed >= 5500, `cut early at ${Math.round(elapsed)} ms: the per-request cap is 6 s`);
	});

	it('one wall-clock deadline covers all hops', async () => {
		const target = await startServer((request, response) => {
			setTimeout(() => {
				response.writeHead(302, { location: `/${Number(request.url.slice(1)) + 1}` });
				response.end();
			}, 150);
		});
		after(target.close);
		const net = named(target.port, { deadlineMs: 400, requestMs: 6000 });
		const started = performance.now();
		await assert.rejects(safeFetch(`http://public.test:${target.port}/0`, {}, createFetchContext(net.options)), status(504));
		assert.ok(performance.now() - started < 1000);
	});

	it('bounds memory against a gzip bomb (decoded bytes are counted)', async () => {
		const bomb = zlib.gzipSync(Buffer.concat([Buffer.from('<title>bomb</title>'), Buffer.alloc(50 * 1024 * 1024)]));
		const target = await startServer((_request, response) => {
			response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
			response.end(bomb);
		});
		after(target.close);
		const unfurler = createUnfurler({ netOptions: named(target.port).options });
		const baseline = process.memoryUsage().rss;
		let peak = baseline;
		const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 2);
		const embed = await unfurler.resolve(`http://public.test:${target.port}/`);
		clearInterval(sampler);
		peak = Math.max(peak, process.memoryUsage().rss);
		assert.equal(embed.title, 'bomb');
		assert.ok(peak - baseline < 16 * 1024 * 1024, `rss grew ${Math.round((peak - baseline) / 1024 / 1024)} MB`);
	});

	it('does not parse an unknown content-encoding', async () => {
		const target = await startServer((_request, response) => {
			response.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'zstd' });
			response.end('<title>hidden</title>');
		});
		after(target.close);
		const unfurler = createUnfurler({ netOptions: named(target.port).options });
		assert.equal((await unfurler.resolve(`http://public.test:${target.port}/`)).title, '');
	});

	it('caps a response at 512 KB', async () => {
		const target = await startServer((_request, response) => sendHtml(response, `<title>head</title>${'x'.repeat(2 * 1024 * 1024)}`));
		after(target.close);
		const net = named(target.port);
		const reply = await safeFetch(`http://public.test:${target.port}/`, { wantBody: () => true }, createFetchContext(net.options));
		assert.equal(reply.body.length, 512 * 1024);
	});

	it('stops reading an endless body at the cap instead of draining it', async () => {
		let closed;
		const closedPromise = new Promise((resolve) => { closed = resolve; });
		const target = await startServer((_request, response) => {
			response.writeHead(200, { 'content-type': 'text/html' });
			response.write('<title>endless</title>');
			const timer = setInterval(() => response.write(Buffer.alloc(64 * 1024, 120)), 1);
			response.on('close', () => { clearInterval(timer); closed(); });
		});
		after(target.close);
		const unfurler = createUnfurler({ netOptions: named(target.port).options });
		const started = performance.now();
		assert.equal((await unfurler.resolve(`http://public.test:${target.port}/`)).title, 'endless');
		assert.ok(performance.now() - started < 3000);
		await closedPromise;
	});

	it('answers 503 above 8 resolves in flight', async () => {
		const target = await startServer(() => {});
		after(target.close);
		const unfurler = createUnfurler({ maxInFlight: 2, netOptions: named(target.port, { requestMs: 600, deadlineMs: 600 }).options });
		const running = [1, 2].map((n) => unfurler.resolve(`http://public.test:${target.port}/${n}`).catch((error) => error));
		await nextTick();
		await assert.rejects(unfurler.resolve(`http://public.test:${target.port}/3`), status(503));
		assert.deepEqual((await Promise.all(running)).map((error) => error.status), [504, 504]);
	});

	it('the shipped limit is 8 resolves in flight', async () => {
		const target = await startServer(() => {});
		after(target.close);
		const unfurler = createUnfurler({ netOptions: named(target.port, { requestMs: 700, deadlineMs: 700 }).options });
		const running = Array.from({ length: 8 }, (_, n) => unfurler.resolve(`http://public.test:${target.port}/${n}`).catch((error) => error));
		await nextTick();
		await assert.rejects(unfurler.resolve(`http://public.test:${target.port}/9`), status(503));
		await Promise.all(running);
	});
});
