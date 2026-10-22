/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-moderation.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * L0 — the RULES layer of moderation: the synchronous check the bridge runs
 * before it writes a message, a post, a comment or a page. The cascade is L0
 * (here, microseconds, in-process) → L1 classifier (async) → L2 judge
 * (borderline only); the bridge has no route to the AI service, so the inline
 * check is rules only. L0 may WARN or HOLD, never remove (C84).
 *
 * Caveat: L0 is a blocklist, and a blocklist is wrong in both directions.
 * Leetspeak and spacing tricks ("f u c k" split into letters) evade it
 * entirely, so a clean L0 verdict is NOT a clean bill of health. A term used
 * innocently in its own right (medical, reclaimed, a surname) warns. The PII
 * regexes see only the shapes written below: they miss every other format and
 * flag some order numbers as phones. The language of a text is NOT detected, so
 * a word benign in one listed language and listed in another warns.
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Bump when a rule changes, so a policyHash change is explainable. */
export const L0_POLICY_VERSION = 'l0-1';

/** Every surface a caller may check. An unknown surface is a programming error. */
export const SURFACES = Object.freeze([
	'chat', 'dm', 'feed_post', 'feed_comment', 'page_comment', 'profile',
	'publish', 'marketplace', 'community', 'channel',
]);

export const MODERATION_MODES = Object.freeze(['off', 'log', 'hold', 'on']);

/** More than this many links in one text is spam-shaped: a hold. */
export const MAX_LINKS = 5;

/** This many identical characters in a row is a key-mash: a warning. */
export const REPEAT_RUN = 30;

const PHONE_MIN_DIGITS = 9, PHONE_MAX_DIGITS = 15;
const CARD_MIN_DIGITS = 13, CARD_MAX_DIGITS = 19;

/** The lists are read once, at module load, and never again. */
const LIST_LANGS = Object.freeze(['en', 'fr', 'es']);

/** Invisible characters a writer can hide a word behind. */
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
/** A word is a run of letters or digits; everything else is a separator. */
const SEPARATOR_RE = /[^\p{L}\p{N}]+/u;

// Every quantifier is bounded and the domain labels hold no dot, so a 20,000-character
// "aaa…@aaa…" costs O(n), not the 227 ms the unbounded form took (measured).
const EMAIL_RE = /[\p{L}\p{N}._%+-]{1,64}@(?:[\p{L}\p{N}-]{1,63}\.){1,8}\p{L}{2,24}/u;
const DIGIT_RUN_RE = /\+?\d(?:[ .-]?\d)+/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;
const LINK_RE = /https?:\/\//g;

/** The strongest verdict a reason can ask for. There is no `remove` (C84). */
const VERDICT_BY_CODE = Object.freeze({ blocklist: 'warn', pii: 'warn', links: 'hold', repeat: 'warn' });
const PII_KINDS = Object.freeze(['email', 'phone', 'card', 'iban']);

/** Fold a text into the shape the matcher compares: no fullwidth, no invisibles, one case. */
export function normalizeForMatch(text) {
	return String(text ?? '')
		.normalize('NFKC')
		.replace(INVISIBLE_RE, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/** Split a normalized text into its words. */
export function tokenize(normalized) {
	return String(normalized ?? '').split(SEPARATOR_RE).filter((token) => token.length > 0);
}

/**
 * Build a matcher over a list of terms.
 *
 * DATA STRUCTURE: a Set of PHRASE KEYS. A key is the term normalized, tokenized
 * and joined by one space, so "two words" and "two  words" are one key, and
 * `maxWords` is the longest phrase in tokens.
 *
 * `match` normalizes and tokenizes the text ONCE, then for each token index i
 * and each n in 1..maxWords looks up the n-gram in the Set: O(tokens x
 * maxWords). A lookup is a whole token sequence, so a term inside a longer word
 * NEVER matches: the Scunthorpe problem, impossible by construction.
 */
export function createMatcher(terms) {
	const keys = new Set();
	let maxWords = 0;
	for (const term of terms ?? []) {
		const tokens = tokenize(normalizeForMatch(term));
		if (tokens.length === 0) continue; // a term that normalizes to nothing
		keys.add(tokens.join(' '));
		if (tokens.length > maxWords) maxWords = tokens.length;
	}
	const hash = createHash('sha256').update([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join('\n'), 'utf8').digest('hex');
	return {
		size: keys.size,
		hash,
		match(text) {
			const tokens = tokenize(normalizeForMatch(text));
			const found = [];
			const seen = new Set();
			for (let i = 0; i < tokens.length; i += 1) {
				let key = tokens[i];
				for (let n = 1; n <= maxWords && i + n <= tokens.length; n += 1) {
					if (n > 1) key += ` ${tokens[i + n - 1]}`;
					if (keys.has(key) && !seen.has(key)) { seen.add(key); found.push(key); }
				}
			}
			return found;
		},
	};
}

function readList(lang) {
	const raw = readFileSync(new URL(`./moderation-lists/${lang}.txt`, import.meta.url), 'utf8');
	return raw.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

/** The default matcher: the union of the en, fr and es lists — every list applies to every text. */
export const DEFAULT_MATCHER = createMatcher(LIST_LANGS.flatMap(readList));

/** Luhn over the digits of a run, separators removed. */
function luhnValid(digits) {
	let sum = 0;
	let twice = false;
	for (let i = digits.length - 1; i >= 0; i -= 1) {
		let d = digits.charCodeAt(i) - 48;
		if (twice) { d *= 2; if (d > 9) d -= 9; }
		sum += d;
		twice = !twice;
	}
	return sum % 10 === 0;
}

/** ISO 7064 mod-97 == 1 over a candidate IBAN. */
function ibanValid(candidate) {
	const s = candidate.replace(/ /g, '').toUpperCase();
	if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
	const rearranged = s.slice(4) + s.slice(0, 4);
	let remainder = 0;
	for (const ch of rearranged) {
		const code = ch.charCodeAt(0);
		const value = code >= 65 && code <= 90 ? code - 55 : code - 48;
		remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
	}
	return remainder === 1;
}

/** The PII kinds present in a text, in a fixed order. Never a `remove`. */
function detectPii(raw, normalized) {
	const found = { email: false, phone: false, card: false, iban: false };
	if (EMAIL_RE.test(normalized)) found.email = true;
	for (const run of normalized.match(DIGIT_RUN_RE) ?? []) {
		const digits = run.replace(/\D/g, '');
		if (digits.length < PHONE_MIN_DIGITS) continue;
		const isCard = digits.length >= CARD_MIN_DIGITS && digits.length <= CARD_MAX_DIGITS && luhnValid(digits);
		if (isCard) found.card = true;
		else if (digits.length <= PHONE_MAX_DIGITS) found.phone = true;
	}
	// The IBAN shape is upper-case, so it is read on the ORIGINAL text.
	for (const candidate of raw.match(IBAN_RE) ?? []) {
		if (ibanValid(candidate)) { found.iban = true; break; }
	}
	return PII_KINDS.filter((kind) => found[kind]);
}

/** The policy hash: the version, the lists and the thresholds. */
/** One code point repeated REPEAT_RUN times in a row: a single O(n) pass (the backreference regex took 173 ms on 20,000 characters). */
function hasRepeatRun(text) {
	let previous = '';
	let run = 0;
	for (const ch of text) {
		run = ch === previous ? run + 1 : 1;
		if (run >= REPEAT_RUN) return true;
		previous = ch;
	}
	return false;
}

function policyHashFor(matcher) {
	const thresholds = [MAX_LINKS, REPEAT_RUN, PHONE_MIN_DIGITS, PHONE_MAX_DIGITS, CARD_MIN_DIGITS, CARD_MAX_DIGITS];
	return createHash('sha256')
		.update([L0_POLICY_VERSION, matcher.hash, ...thresholds].join('|'), 'utf8')
		.digest('hex');
}

/**
 * Check a text against the L0 rules.
 *
 * `surface` is one of SURFACES; anything else is a programming error and
 * throws a TypeError (a bad surface is a bug in the caller, not bad user input,
 * and it must not be swallowed into a silent "allow").
 *
 * The verdict is the strongest contribution: allow < warn < hold. There is no
 * `remove` (C84). On surface `dm` the verdict is capped at `warn`: a direct
 * message is an author-side warning only, and L0 records no DM content (C94).
 *
 * The returned `terms` are the MATCHED BLOCKLIST TERMS, so the author's UI can
 * highlight them in place. A caller must NOT log them: a log line is a copy of
 * the author's message (C94). Log the reason CODES, never the terms.
 *
 * The function does no I/O and no logging.
 */
export function checkText(text, { surface, matcher = DEFAULT_MATCHER } = {}) {
	if (!SURFACES.includes(surface)) {
		throw new TypeError(`checkText: unknown surface ${JSON.stringify(surface)}`);
	}
	const raw = String(text ?? '');
	const normalized = normalizeForMatch(raw);
	const reasons = [];
	const terms = matcher.match(raw);
	if (terms.length > 0) reasons.push({ code: 'blocklist', terms });
	const kinds = detectPii(raw, normalized);
	if (kinds.length > 0) reasons.push({ code: 'pii', kinds });
	const count = (normalized.match(LINK_RE) ?? []).length;
	if (count > MAX_LINKS) reasons.push({ code: 'links', count });
	if (hasRepeatRun(normalized)) reasons.push({ code: 'repeat' });

	let verdict = 'allow';
	for (const reason of reasons) {
		const wanted = VERDICT_BY_CODE[reason.code];
		if (wanted === 'hold') verdict = 'hold';
		else if (verdict === 'allow') verdict = 'warn';
	}
	if (surface === 'dm' && verdict === 'hold') verdict = 'warn';
	return { verdict, reasons, policyHash: policyHashFor(matcher) };
}

/**
 * The mode switch: OSIONOS_MODERATION_ACTIONS is off | log | hold | on. Unset,
 * empty or unknown is `log` — shadow first (C85). An unknown value is NOT
 * case-folded: a typo must not silently turn enforcement ON.
 */
export function moderationMode(env = process.env) {
	const raw = env?.OSIONOS_MODERATION_ACTIONS;
	if (typeof raw !== 'string') return 'log';
	const value = raw.trim();
	return MODERATION_MODES.includes(value) ? value : 'log';
}

/**
 * What a caller enforces. `off` and `log` allow everything (the caller records
 * the would-be verdict and the codes only); `hold` and `on` enforce the verdict
 * as it is. A `warn` is ADVICE to the author, never an action.
 */
export function effectiveVerdict(verdict, mode) {
	const effective = MODERATION_MODES.includes(mode) ? mode : 'log';
	return effective === 'off' || effective === 'log' ? 'allow' : verdict;
}
