/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-moderation.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
	DEFAULT_MATCHER,
	MAX_LINKS,
	MODERATION_MODES,
	SURFACES,
	checkText,
	createMatcher,
	effectiveVerdict,
	moderationMode,
	normalizeForMatch,
	tokenize,
} from '../../scripts/bridge-moderation.mjs';

const LIST_DIR = new URL('../../scripts/moderation-lists/', import.meta.url);

function readList(lang) {
	return readFileSync(new URL(`${lang}.txt`, LIST_DIR), 'utf8')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

const LANGS = ['en', 'fr', 'es'];
const EN_TERMS = readList('en');
const ALL_TERMS = LANGS.flatMap(readList);

/**
 * The words the normalize and match rules are proven on are READ from the list
 * at runtime, never pasted here: the test must follow the list, not a copy of
 * it, or a list update would leave the test proving the wrong word.
 */
const PLAIN_TERM = EN_TERMS.find((term) => /^[a-z]{4,}$/.test(term));
const PHRASE_TERM = EN_TERMS.find((term) => term.includes(' '));

/** Only a single-word term can be a substring of a longer word. */
const SINGLE_TERM_KEYS = ALL_TERMS
	.map((term) => normalizeForMatch(term))
	.filter((term) => !term.includes(' '));

const toFullwidth = (text) => text
	.split('')
	.map((ch) => (ch.charCodeAt(0) < 128 ? String.fromCharCode(ch.charCodeAt(0) + 0xfee0) : ch))
	.join('');

const withInvisible = (text, code) => {
	const middle = Math.floor(text.length / 2);
	return `${text.slice(0, middle)}${code}${text.slice(middle)}`;
};

/** The benign fixture: sentences that CONTAIN a list term inside a longer word. */
const FIXTURE = readFileSync(new URL('./fixtures/moderation-benign.txt', import.meta.url), 'utf8');
const FIXTURE_LINES = [];
{
	let lang = null;
	for (const raw of FIXTURE.split('\n')) {
		const line = raw.trim();
		if (line.length === 0) continue;
		if (line.startsWith('#')) {
			const section = line.match(/^#\s+(en|fr|es)\b/);
			if (section) lang = section[1];
			continue;
		}
		FIXTURE_LINES.push({ lang, line });
	}
}

const URL_SIX = [
	'https://one.example/a', 'https://two.example/b', 'https://three.example/c',
	'https://four.example/d', 'https://five.example/e', 'https://six.example/f',
].join(' ');

const MIXED = 'the quick brown fox jumps over the lazy dog, again and again. '
	+ 'contact alice@example.com about the order 4539 5787 6362 1486 before Friday. '
	+ 'see https://example.com/one and https://example.com/two for the details. ';

describe('normalizeForMatch', () => {
	it('folds fullwidth letters, a soft hyphen, zero-width spaces and case into the plain word', () => {
		const plain = normalizeForMatch(PLAIN_TERM);
		assert.equal(plain, PLAIN_TERM);
		assert.equal(normalizeForMatch(PLAIN_TERM.toUpperCase()), plain);
		assert.equal(normalizeForMatch(toFullwidth(PLAIN_TERM)), plain);
		assert.equal(normalizeForMatch(withInvisible(PLAIN_TERM, '\u00ad')), plain);
		assert.equal(normalizeForMatch(withInvisible(PLAIN_TERM, '\u200b')), plain);
		assert.equal(normalizeForMatch(withInvisible(PLAIN_TERM, '\u202e')), plain);
		assert.equal(normalizeForMatch(`   ${PLAIN_TERM}\n  `), plain);
	});

	it('tokenizes on every non-letter, non-digit run', () => {
		assert.deepEqual(tokenize(normalizeForMatch('two, words; and-three')), ['two', 'words', 'and', 'three']);
		assert.deepEqual(tokenize(normalizeForMatch('')), []);
	});
});

describe('createMatcher', () => {
	it('matches a list term alone, with zero-width characters, in fullwidth and as a phrase', () => {
		assert.deepEqual(DEFAULT_MATCHER.match(PLAIN_TERM), [PLAIN_TERM]);
		assert.deepEqual(DEFAULT_MATCHER.match(withInvisible(PLAIN_TERM, '\u200b')), [PLAIN_TERM]);
		assert.deepEqual(DEFAULT_MATCHER.match(toFullwidth(PLAIN_TERM)), [PLAIN_TERM]);
		assert.deepEqual(DEFAULT_MATCHER.match(PHRASE_TERM), [PHRASE_TERM]);
	});

	it('never matches a term that sits inside a longer word', () => {
		// The Scunthorpe shape: the term is a SUBSTRING of a word, not the word.
		assert.deepEqual(DEFAULT_MATCHER.match('carnival'), []);
		assert.deepEqual(DEFAULT_MATCHER.match('classic'), []);
	});
});

describe('checkText', () => {
	it('C84: a list term inside a longer word never blocks a benign sentence', () => {
		const counts = { en: 0, fr: 0, es: 0 };
		for (const { lang, line } of FIXTURE_LINES) {
			counts[lang] += 1;
			const words = tokenize(normalizeForMatch(line));
			const inside = SINGLE_TERM_KEYS.some((key) => words.some((word) => word.length > key.length && word.includes(key)));
			assert.ok(inside, `no list term inside a longer word: ${line}`);
			const result = checkText(line, { surface: 'feed_post' });
			assert.deepEqual(result.reasons, [], `blocked: ${line}`);
			assert.equal(result.verdict, 'allow', `blocked: ${line}`);
		}
		assert.equal(FIXTURE_LINES.length, 200);
		assert.ok(counts.en >= 60 && counts.fr >= 60 && counts.es >= 60, JSON.stringify(counts));
	});

	it('pii: an email, a phone, a Luhn-valid card and a valid IBAN warn with their kinds', () => {
		const email = checkText('write to alice@example.com now', { surface: 'chat' });
		assert.equal(email.verdict, 'warn');
		assert.deepEqual(email.reasons[0].kinds, ['email']);

		const phone = checkText('call 555 123 4567 tonight', { surface: 'chat' });
		assert.equal(phone.verdict, 'warn');
		assert.deepEqual(phone.reasons[0].kinds, ['phone']);

		const card = checkText('card 4539578763621486 expired', { surface: 'chat' });
		assert.equal(card.verdict, 'warn');
		assert.deepEqual(card.reasons[0].kinds, ['card']);

		const iban = checkText('iban FR1420041010050500013M02606 please', { surface: 'chat' });
		assert.equal(iban.verdict, 'warn');
		assert.deepEqual(iban.reasons[0].kinds, ['iban']);
	});

	it('pii: a 16-digit run that fails Luhn is not a card', () => {
		const result = checkText('order 1234567890123456 shipped', { surface: 'chat' });
		const kinds = result.reasons.find((reason) => reason.code === 'pii')?.kinds ?? [];
		assert.ok(!kinds.includes('card'), JSON.stringify(kinds));
	});

	it('pii: author-side only, it never raises the verdict above warn', () => {
		const result = checkText(
			'mail alice@example.com, call 555 123 4567, card 4539578763621486, iban FR1420041010050500013M02606',
			{ surface: 'feed_post' },
		);
		assert.equal(result.verdict, 'warn');
		assert.deepEqual(result.reasons[0].kinds, ['email', 'phone', 'card', 'iban']);
	});

	it('links: more than five links hold a post, and a DM is capped at warn (C94)', () => {
		const post = checkText(URL_SIX, { surface: 'feed_post' });
		assert.equal(post.verdict, 'hold');
		assert.deepEqual(post.reasons.find((reason) => reason.code === 'links'), { code: 'links', count: MAX_LINKS + 1 });

		const dm = checkText(URL_SIX, { surface: 'dm' });
		assert.equal(dm.verdict, 'warn');
		assert.equal(dm.reasons.find((reason) => reason.code === 'links').count, MAX_LINKS + 1);

		const five = checkText(URL_SIX.split(' ').slice(0, MAX_LINKS).join(' '), { surface: 'feed_post' });
		assert.equal(five.verdict, 'allow');
		assert.ok(!five.reasons.some((reason) => reason.code === 'links'));
	});

	it('never returns a remove verdict, over every fixture line and every surface', () => {
		for (const { line } of FIXTURE_LINES) {
			for (const surface of SURFACES) {
				const result = checkText(line, { surface });
				assert.notEqual(result.verdict, 'remove', `${surface}: ${line}`);
				assert.ok(['allow', 'warn', 'hold'].includes(result.verdict), `${surface}: ${line}`);
			}
		}
	});

	it('throws a TypeError on an unknown surface', () => {
		assert.throws(() => checkText('hello', { surface: 'nowhere' }), TypeError);
		assert.throws(() => checkText('hello', {}), TypeError);
		assert.throws(() => checkText('hello', { surface: 'CHAT' }), TypeError);
	});

	it('holds a policy hash that changes with the list and with the thresholds', () => {
		const base = checkText('hello', { surface: 'chat', matcher: createMatcher(['alpha', 'beta']) });
		const more = checkText('hello', { surface: 'chat', matcher: createMatcher(['alpha', 'beta', 'gamma']) });
		const same = checkText('hello', { surface: 'chat', matcher: createMatcher(['beta', 'alpha']) });
		assert.notEqual(base.policyHash, more.policyHash);
		assert.equal(base.policyHash, same.policyHash);
		assert.match(base.policyHash, /^[0-9a-f]{64}$/);
	});
});

describe('moderationMode', () => {
	it('is log when unset, empty or unknown, and the valid value otherwise', () => {
		assert.equal(moderationMode({}), 'log');
		assert.equal(moderationMode({ OSIONOS_MODERATION_ACTIONS: '' }), 'log');
		assert.equal(moderationMode({ OSIONOS_MODERATION_ACTIONS: 'bogus' }), 'log');
		for (const mode of MODERATION_MODES) {
			assert.equal(moderationMode({ OSIONOS_MODERATION_ACTIONS: mode }), mode);
		}
	});

	it('effectiveVerdict allows everything in off and log, and enforces in hold and on', () => {
		assert.equal(effectiveVerdict('hold', 'log'), 'allow');
		assert.equal(effectiveVerdict('hold', 'off'), 'allow');
		assert.equal(effectiveVerdict('hold', 'hold'), 'hold');
		assert.equal(effectiveVerdict('hold', 'on'), 'hold');
		assert.equal(effectiveVerdict('warn', 'on'), 'warn');
	});
});

describe('speed', () => {
	it('checks a 2,000-character text in under 5 ms at p95', () => {
		const text = MIXED.repeat(Math.ceil(2000 / MIXED.length)).slice(0, 2000);
		assert.equal(text.length, 2000);
		const durations = [];
		for (let i = 0; i < 1000; i += 1) {
			const started = process.hrtime.bigint();
			checkText(text, { surface: 'feed_post' });
			durations.push(Number(process.hrtime.bigint() - started) / 1e6);
		}
		durations.sort((a, b) => a - b);
		const p50 = durations[Math.floor(durations.length * 0.5)];
		const p95 = durations[Math.floor(durations.length * 0.95)];
		console.log(`[l0 speed] p50=${p50.toFixed(3)} ms p95=${p95.toFixed(3)} ms over ${durations.length} calls`);
		assert.ok(p95 < 5, `p95 ${p95.toFixed(3)} ms is over the 5 ms budget`);
	});
});
