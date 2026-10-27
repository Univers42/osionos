import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { DEFAULT_MAX_CHARS, htmlToText, MAX_DEPTH, MAX_TOKENS, plainToText } from '../src/web/htmlText.ts';

const text = (html: string, maxChars?: number) => htmlToText(html, { maxChars }).text;

describe('web C347 html to text', () => {
	it('C347 block elements become line breaks and whitespace collapses', () => {
		assert.equal(text('<h1>Title</h1>\n\n<p>One   two\n three</p><div>four<br>five</div><ul><li>a</li><li>b</li></ul>'), 'Title\nOne two three\nfour\nfive\na\nb');
		assert.equal(text('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>'), 'a b\nc');
		assert.equal(text('  <span>x</span><span>y</span> <b>z</b>  '), 'xy z');
	});

	it('C347 script, style, template, noscript, svg, head and comments are dropped; the title is kept', () => {
		const html = '<html><head><title> My &amp; Page </title><style>.a{}</style><script>var x = "<p>no</p>";</script></head><body>' +
			'<!-- <p>comment</p> --><noscript>nojs</noscript><template><p>tpl</p></template><svg><title>svg title</title><text>svgtext</text></svg>' +
			'<SCRIPT>alert(1)</SCRIPT ><p>shown</p></body></html>';
		const out = htmlToText(html);
		assert.deepEqual([out.title, out.text], ['My & Page', 'shown']);
	});

	it('C347 hidden, aria-hidden="true" and inline display:none elements go with everything inside', () => {
		const html = '<p>a</p><div hidden><p>h1</p><div>deep</div></div><p>b</p><span aria-hidden="true">ah</span><p aria-hidden="false">visible</p>' +
			'<div style="color:red; DISPLAY : NONE">dn<b>x</b></div><div style="visibility:hidden">vh</div><p style="display:block">blk</p><p>c</p>';
		assert.equal(text(html), 'a\nb\nvisible\nblk\nc');
	});

	it('C347 an unclosed hidden element ends with the close tag of its parent, not at the end of the page', () => {
		assert.equal(text('<ul><li hidden>gone<li>also gone</ul><p>back</p>'), 'back');
	});

	it('C347 hidden links are not collected, visible ones are, an href is entity-decoded', () => {
		const out = htmlToText('<a href="/a?x=1&amp;y=2">a</a><a hidden href="/h">h</a><div hidden><a href="/h2">h2</a></div><a>none</a><a href=/u>u</a><a href=\'/q\'>q</a>');
		assert.deepEqual(out.hrefs, ['/a?x=1&y=2', '/u', '/q']);
	});

	it('C347 entities: the fixed table and numeric references; unknown ones stay as written', () => {
		assert.equal(text('&amp; &lt;b&gt; &quot;q&quot; &#65;&#x42; &copy; &hellip; &eacute; &amp &#0; &#xD800; &#x110000; &bogus;'), '& ‹b> "q" AB © … &eacute; &amp &bogus;');
		assert.equal(text('&amp;lt;'), '&lt;', 'decoded once, never twice');
	});

	it('C347 a < that opens nothing is text, and the output never contains <', () => {
		assert.equal(text('a < b <3 c <<d>> <!x> <?php echo 1 ?> e'), 'a ‹ b ‹3 c ‹> e');
		assert.ok(!text('&lt;script&gt;alert(1)&lt;/script&gt;&#60;/p&#x3c;').includes('<'));
	});

	it('C347 controls and format characters are stripped: zero-width, bidi, the tag block, C0 and C1', () => {
		const sneaky = 'a​b‮c⁦d﻿e\u{E0041}\u{E0020}f\u0000g\u0007h\u0085i\u009Fj­k';
		assert.equal(text(`<p>${sneaky}</p>`), 'abcdefghijk');
		assert.equal(plainToText(sneaky), 'abcdefghijk');
		assert.equal(text('a 　 b'), 'a b');
	});

	it('C347 the output is cut at maxChars, never past it, never in the middle of a pair', () => {
		assert.equal(text('<p>' + 'word '.repeat(10_000) + '</p>').length <= DEFAULT_MAX_CHARS, true);
		assert.equal(text('abcdefghij', 4), 'abcd');
		assert.equal(text('ab 😀😀', 4), 'ab');
		assert.equal(text('ab 😀😀', 5), 'ab 😀');
		assert.equal(text('x', 0), '');
	});

	it('C347 plain text keeps its lines, collapses runs of blanks and ignores tags', () => {
		assert.equal(plainToText('one   two\n\n\n  three <b> four'), 'one two\nthree ‹b> four');
	});

	it('C347 the depth and token caps end the parse and return what was read', () => {
		const deep = `<p>start</p>${'<div>'.repeat(MAX_DEPTH + 10)}<p>never</p>`;
		assert.equal(text(deep), 'start');
		const many = `<p>first</p>${'<i>x</i>'.repeat(MAX_TOKENS)}<p>never</p>`;
		assert.ok(!text(many, 1_000_000).includes('never'));
		assert.ok(text(many, 1_000_000).startsWith('first'));
	});

	it('C347 an unterminated tag, comment, quote or script ends the parse quietly', () => {
		for (const html of ['<p>a</p><div class="x', '<p>a</p><!-- never closed', '<p>a</p><script>never closed', '<p>a</p><a href=\'x', '<p>a</p></div', '<p>a</p><p']) {
			assert.equal(text(html), 'a', html);
		}
	});
});

describe('web C347 a hostile page costs linear time', () => {
	// Measured 2026-10-26, node 22.23 in node:22-bookworm-slim, two runs each,
	// the exact inputs below: nested <div> 1 ms, <<<< 53 ms, 100k unclosed
	// attributes 5 ms (both quote kinds), & 143 ms, unclosed <!-- 6 ms, a script
	// of </x 17 ms, <a with no end 26 ms, hidden opens/closes 15 ms. Command:
	//   sh quicktest.sh <worktree> --test-reporter=spec tests/webHtml.test.ts
	// The bound is 1000 ms, seven times the slowest measure; a quadratic parse
	// of 2 MiB takes minutes, so it cannot hide under it.
	const BOUND_MS = 1000;
	const MIB2 = 2 * 1024 * 1024;
	const cases: [string, string][] = [
		['2 MiB of nested <div>', '<div>'.repeat(Math.ceil(MIB2 / 5))],
		['2 MiB of <<<<', '<'.repeat(MIB2)],
		['100k unclosed attributes', '<a b="'.repeat(100_000)],
		['100k unclosed single-quoted attributes', "<a b='".repeat(100_000)],
		['2 MiB of &', '&'.repeat(MIB2)],
		['500k unclosed comment openers', '<!--'.repeat(500_000)],
		['a script full of </ lookalikes', `<script>${'</x'.repeat(MIB2 / 3)}`],
		['2 MiB of <a with no end', '<a '.repeat(MIB2 / 3)],
		['200k hidden opens then closes', `${'<div hidden>'.repeat(200)}x${'</div>'.repeat(200_000)}`],
	];
	for (const [name, html] of cases) {
		it(`C347 ${name} finishes under ${BOUND_MS} ms`, () => {
			const started = performance.now();
			const out = htmlToText(html);
			const elapsed = performance.now() - started;
			assert.ok(out.text.length <= DEFAULT_MAX_CHARS);
			assert.ok(elapsed < BOUND_MS, `${name} took ${Math.round(elapsed)} ms`);
		});
	}
});

describe('web C347 properties', () => {
	const fragments = fc.constantFrom('<', '>', '</', '<div', '<a href="', '"', "'", '=', '&', '&#', '&amp;', ';', '<!--', '-->', '<script>', '</script>',
		'<p hidden>', '<svg>', '<title>', '</title>', ' ', '\n', '​', '‮', '\u0000', 'x', 'é', '😀', '/', '<br/>', '<a>', '</a>');
	const pages = fc.oneof(fc.string({ maxLength: 400 }), fc.array(fragments, { maxLength: 200 }).map((parts) => parts.join('')), fc.string({ unit: 'binary', maxLength: 400 }));

	it('C347 for any input it never throws, never emits <, and stays within maxChars', () => {
		fc.assert(
			fc.property(pages, fc.integer({ min: 0, max: 300 }), (html, maxChars) => {
				const out = htmlToText(html, { maxChars });
				assert.ok(out.text.length <= maxChars);
				assert.ok(!out.text.includes('<') && !out.title.includes('<'));
				assert.ok(!/[\p{Cc}\p{Cf}]/u.test(out.text.replaceAll('\n', '')));
				assert.ok(out.title.length <= 300);
				assert.ok(!out.text.startsWith(' ') && !out.text.endsWith(' ') && !out.text.endsWith('\n'));
			}),
			{ numRuns: 500 },
		);
	});

	it('C347 plain text obeys the same output rules', () => {
		fc.assert(
			fc.property(pages, fc.integer({ min: 0, max: 300 }), (raw, maxChars) => {
				const out = plainToText(raw, maxChars);
				assert.ok(out.length <= maxChars && !out.includes('<'));
			}),
			{ numRuns: 300 },
		);
	});
});
