/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-unfurl-scan.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Bounded HTML scanning for the unfurler: head extraction, tag/attribute parsing,
 * entity decoding and URL absolutising. No regex here backtracks across the document.
 *
 * Caveat: a regex scan, not an HTML parser; markup inside comments or scripts in the head
 * can be read as real tags, and tags past the caps are ignored (under-reporting).
 */

import { safeText } from './bridge-social-core.mjs';
import { MAX_URL_LENGTH } from './bridge-unfurl-net.mjs';

// Every scan below is bounded per tag: an unbounded `(?:"[^"]*"|...)*` body went
// quadratic on repeated unclosed tags (64 KB = 1.8 s, 512 KB = 152 s, measured),
// and the deadline cannot interrupt synchronous parsing.
const MAX_HEAD_BYTES = 65_536;
const MAX_TAG_LENGTH = 1024;
const MAX_TAGS = 400;
// Characters one tag scan may examine in total: 4 x the head cap keeps worst-case
// work at a few million steps no matter how many unclosed tags the page repeats.
const MAX_SCAN_WORK = 262_144;
const MAX_TITLE_LENGTH = 2000;
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
	return text.replaceAll(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]{2,6}));/gi, (whole, dec, hex, name) => {
		if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
		const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
		return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
	});
}

export const cleanText = (value, cap) => safeText(decodeEntities(String(value ?? '')).replaceAll(/\s+/g, ' '), cap);

function attributesOf(source) {
	const attributes = Object.create(null);
	for (const match of source.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
		const key = match[1].toLowerCase();
		if (!(key in attributes)) attributes[key] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
	}
	return attributes;
}

/** Index of the `>` closing the tag whose attributes start at `from`, quotes respected; -1 past the length bound. */
function tagEnd(html, from, work = { left: MAX_SCAN_WORK }) {
	const limit = Math.min(html.length, from + MAX_TAG_LENGTH, from + work.left);
	let quote = '';
	for (let i = from; i < limit; i++) {
		const char = html[i];
		if (quote) quote = char === quote ? '' : quote;
		else if (char === '"' || char === "'") quote = char;
		else if (char === '>') {
			work.left -= i - from;
			return i;
		}
	}
	work.left -= limit - from;
	return -1;
}

export function documentHead(html) {
	const capped = html.length > MAX_HEAD_BYTES ? html.slice(0, MAX_HEAD_BYTES) : html;
	const close = /<\/head\b/i.exec(capped);
	return close ? capped.slice(0, close.index) : capped;
}

export function tagsNamed(html, name) {
	const found = [];
	const work = { left: MAX_SCAN_WORK };
	for (const match of html.matchAll(new RegExp(`<${name}\\b`, 'gi'))) {
		if (work.left <= 0) break;
		const start = match.index + match[0].length;
		const end = tagEnd(html, start, work);
		if (end < 0) continue;
		found.push(attributesOf(html.slice(start, end)));
		if (found.length >= MAX_TAGS) break;
	}
	return found;
}

export function titleOf(html) {
	const open = /<title\b/i.exec(html);
	if (!open) return '';
	const start = tagEnd(html, open.index + open[0].length);
	if (start < 0) return '';
	const body = html.slice(start + 1, start + 1 + MAX_TITLE_LENGTH + 8);
	const close = /<\/title/i.exec(body);
	return close ? body.slice(0, close.index) : '';
}

/** Absolute http(s) URL without userinfo and within the length cap, else null. */
export function absoluteHttpUrl(value, base) {
	if (typeof value !== 'string' || value === '' || value.length > MAX_URL_LENGTH) return null;
	let url;
	try { url = new URL(value.trim(), base); } catch { return null; }
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (url.username || url.password || url.href.length > MAX_URL_LENGTH) return null;
	return url.href;
}
