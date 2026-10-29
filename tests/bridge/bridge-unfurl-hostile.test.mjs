/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-hostile.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Hostile page content: parse cost must stay linear (the 10 s deadline cannot
// interrupt synchronous parsing) and absurd numbers must not reach the GCD.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

import { createUnfurler } from '../../scripts/bridge-unfurl-core.mjs';
import { aspectOf, extractPage, parseOembed } from '../../scripts/bridge-unfurl-parse.mjs';
import { loopbackNet, sendHtml, startServer } from './bridge-unfurl-helpers.mjs';

const PAGE_BYTES = 512 * 1024;
const fill = (unit) => unit.repeat(Math.floor(PAGE_BYTES / unit.length));
const BASE = 'https://evil.example/';
// 200 ms is ~100x the measured linear cost and ~9000x below the quadratic one (7.2 s at 128 KB).
const BUDGET_MS = 200;

function timed(task) {
	const started = performance.now();
	const value = task();
	return { value, ms: performance.now() - started };
}

describe('parse cost on hostile pages', () => {
	for (const unit of ['<link ', '<meta ', '<title', '<meta content="', "<link rel='", '<meta<meta']) {
		it(`parses 512 KB of repeated ${JSON.stringify(unit)} in under ${BUDGET_MS} ms`, () => {
			const { ms } = timed(() => extractPage(fill(unit), BASE));
			assert.ok(ms < BUDGET_MS, `took ${Math.round(ms)} ms`);
		});
	}

	it('still reads the tags of a normal head and ignores the body', () => {
		const page = `<head><title>T</title><meta property="og:description" content="D"></head><body><meta property="og:title" content="late"></body>`;
		const info = extractPage(page, BASE);
		assert.equal(info.title, 'T');
		assert.equal(info.description, 'D');
	});

	it('ignores metadata past the 64 KB head cap', () => {
		const info = extractPage(`${'<!-- -->'.repeat(10_000)}<meta property="og:title" content="too late">`, BASE);
		assert.equal(info.title, '');
	});

	it('resolves a hostile 512 KB page end to end well under the deadline', async () => {
		const target = await startServer((_request, response) => sendHtml(response, fill('<link ')));
		after(target.close);
		const net = loopbackNet({ ports: [target.port], names: { 'public.test': ['127.0.0.1'] } });
		const started = performance.now();
		const embed = await createUnfurler({ netOptions: net.options }).resolve(`http://public.test:${target.port}/`);
		assert.equal(embed.kind, 'link');
		assert.ok(performance.now() - started < 1000, `took ${Math.round(performance.now() - started)} ms`);
	});
});

describe('absurd dimensions', () => {
	it('falls back to 16/9 for Infinity, NaN, huge, zero and negative sizes', () => {
		for (const [w, h] of [['1e400', '1e400'], [Infinity, 10], [NaN, 10], [20_000, 10], [10, 0], [-5, 5], ['abc', '5']]) {
			assert.equal(aspectOf(w, h), '16/9', `${w}x${h}`);
		}
	});

	it('keeps sane sizes', () => {
		assert.equal(aspectOf(1920, 1080), '16/9');
		assert.equal(aspectOf(16_384, 16_384), '1/1');
	});

	it('does not overflow the stack on og:video:width="1e400" or oEmbed width 1e400', () => {
		const meta = `<meta property="og:video" content="https://p.example/e"><meta property="og:video:type" content="text/html"><meta property="og:video:width" content="1e400"><meta property="og:video:height" content="1e400">`;
		assert.equal(extractPage(meta, BASE).player.aspect, '16/9');
		const oembed = parseOembed('{"type":"video","html":"<iframe src=\\"https://p.example/e\\"></iframe>","width":1e400,"height":1e400}', BASE);
		assert.equal(oembed.player.aspect, '16/9');
	});
});
