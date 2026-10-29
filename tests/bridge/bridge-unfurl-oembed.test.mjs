/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-oembed.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Known-provider oEmbed table, driven through stubbed transports: no socket is opened.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

import { createUnfurler } from '../../scripts/bridge-unfurl-core.mjs';
import { oembedEndpointFor } from '../../scripts/bridge-unfurl-oembed.mjs';

const OEMBED = JSON.stringify({ type: 'video', title: 'Never Gonna', author_name: 'Rick', provider_name: 'YouTube', thumbnail_url: 'https://i.ytimg.com/vi/x/hq.jpg', html: '<iframe src="https://www.youtube.com/embed/x"></iframe>' });
const PAGE = '<!doctype html><html><head><title>From the page</title></head><body></body></html>';

/** Transport whose answers come from `routes(hostname, path)`; records every request. */
function stubTransport(routes) {
	const seen = [];
	const request = (options, callback) => {
		seen.push({ host: options.hostname, path: options.path });
		const req = new EventEmitter();
		req.end = () => {
			const reply = routes(options.hostname, options.path) ?? { status: 504, type: 'text/plain', body: '' };
			const response = Readable.from([Buffer.from(reply.body)]);
			response.statusCode = reply.status ?? 200;
			response.headers = { 'content-type': reply.type };
			setImmediate(() => callback(response));
		};
		return req;
	};
	return { seen, transports: { http: { request }, https: { request } } };
}

const unfurlerFor = (stub, resolveHost = async () => ['93.184.216.34']) => createUnfurler({ netOptions: { resolveHost, transports: stub.transports } });
const endpointRoute = (hostname, path) => (hostname === 'www.youtube.com' && path.startsWith('/oembed')
	? { type: 'application/json', body: OEMBED }
	: { type: 'text/html', body: PAGE });

describe('known oEmbed endpoints', () => {
	it('a youtube.com URL is answered by the endpoint with title and image', async () => {
		const stub = stubTransport(endpointRoute);
		const info = await unfurlerFor(stub).resolve('https://www.youtube.com/watch?v=x');
		assert.equal(info.title, 'Never Gonna');
		assert.equal(info.image, 'https://i.ytimg.com/vi/x/hq.jpg');
		assert.deepEqual(stub.seen.map((r) => r.host), ['www.youtube.com']);
		assert.ok(stub.seen[0].path.startsWith('/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dx'));
	});

	it('an endpoint failure falls back to the page', async () => {
		const stub = stubTransport((host, path) => (path.startsWith('/oembed') ? { status: 504, type: 'text/plain', body: '' } : { type: 'text/html', body: PAGE }));
		const info = await unfurlerFor(stub).resolve('https://www.youtube.com/watch?v=x');
		assert.equal(info.title, 'From the page');
		assert.equal(stub.seen.length, 2);
	});

	it('a non-JSON endpoint answer falls back to the page', async () => {
		const stub = stubTransport(() => ({ type: 'text/html', body: PAGE }));
		const info = await unfurlerFor(stub).resolve('https://youtu.be/x');
		assert.equal(info.title, 'From the page');
	});

	for (const lookalike of ['https://youtube.com.evil.example/watch?v=x', 'https://evilyoutube.com/watch?v=x', 'https://notvimeo.com/1']) {
		it(`${lookalike} does not use the table`, async () => {
			assert.equal(oembedEndpointFor(new URL(lookalike)), null);
			const stub = stubTransport(endpointRoute);
			const info = await unfurlerFor(stub).resolve(lookalike);
			assert.equal(info.title, 'From the page');
			assert.deepEqual(stub.seen.map((r) => r.host), [new URL(lookalike).hostname]);
		});
	}

	it('matches subdomains and trailing-dot hosts of listed domains', () => {
		assert.ok(oembedEndpointFor(new URL('https://m.youtube.com/watch?v=x')));
		assert.ok(oembedEndpointFor(new URL('https://music.youtube.com/watch?v=x')));
		assert.ok(oembedEndpointFor(new URL('https://YOUTUBE.COM./watch?v=x')));
		assert.ok(oembedEndpointFor(new URL('https://dai.ly/x1')).startsWith('https://www.dailymotion.com/services/oembed'));
	});

	it('the endpoint request still goes through the guard', async () => {
		const stub = stubTransport(endpointRoute);
		const resolveHost = async (host) => (host === 'www.youtube.com' ? ['127.0.0.1'] : ['93.184.216.34']);
		const info = await unfurlerFor(stub, resolveHost).resolve('https://www.youtube.com/watch?v=x').catch((error) => error);
		assert.ok(info instanceof Error);
		assert.deepEqual(stub.seen, []);
	});
});
