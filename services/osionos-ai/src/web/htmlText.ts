import { decodeEntities, TextSink } from './htmlSink.ts';

/**
 * A page's HTML as the text a person would read, and the hrefs of its links
 * (web C347).
 *
 * One linear pass of a hand-written tokenizer: no DOM, no dependency and no
 * regex over the input, because the input is a stranger's 2 MiB and a regex
 * that backtracks on it is a denial of service. Every scan moves the cursor
 * past what it read, and a scan that finds no end (an unclosed comment, quote
 * or script) ends the parse instead of being retried from the next `<`.
 * That is the whole complexity argument; tests/webHtml.test.ts measures it.
 *
 * Dropped: script, style, template, noscript, svg, head (its `<title>` is
 * kept), comments, and any element that is `hidden`, `aria-hidden="true"` or
 * has an inline `display:none` / `visibility:hidden`, with everything inside.
 * Two caps end the parse early: MAX_TOKENS tags and MAX_DEPTH open elements;
 * what was read so far is returned.
 *
 * Caveat: this reads the markup, not the rendered page. Navigation and cookie
 * boilerplate stay; a page rendered by JavaScript comes back (near) empty;
 * hidden text is found by attribute and inline style only, so text hidden by
 * a stylesheet, off-screen positioning or white-on-white is still returned
 * (under-reporting hidden text: the model must treat every page as untrusted
 * data either way). Elements are closed by an explicit close tag only, so an
 * unclosed hidden `<li>` stays hidden up to the close tag of its parent.
 */

export const MAX_TOKENS = 100_000;
export const MAX_DEPTH = 256;
export const DEFAULT_MAX_CHARS = 12_000;
const MAX_TITLE_CHARS = 300;
const MAX_HREFS = 500;
const MAX_HREF_LENGTH = 2048;
const MAX_STYLE_LENGTH = 1024;

const DROPPED = new Set(['script', 'style', 'template', 'noscript', 'svg', 'head']);
const RAW_TEXT = new Set(['script', 'style']);
const VOID = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);
const BLOCK = new Set([
	'address', 'article', 'aside', 'blockquote', 'body', 'br', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset',
	'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main',
	'nav', 'ol', 'p', 'pre', 'section', 'table', 'tr', 'ul',
]);

export interface HtmlText {
	title: string;
	text: string;
	hrefs: string[];
}

interface Tag {
	name: string;
	end: number;
	selfClosing: boolean;
	hidden: boolean;
	href: string | null;
}

const isSpace = (code: number): boolean => code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0x0c;
const isLetter = (code: number): boolean => (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);

/** Where a name ends: a space, `/` or `>`. */
function nameEnd(html: string, from: number): number {
	let index = from;
	while (index < html.length) {
		const code = html.charCodeAt(index);
		if (isSpace(code) || code === 0x2f || code === 0x3e) break;
		index += 1;
	}
	return index;
}

/** A name, lower-cased; an absurdly long one is not an element we know. */
function nameOf(html: string, from: number, to: number): string {
	return to - from > 32 ? '?' : html.slice(from, to).toLowerCase();
}

/** The `hidden` verdict of one attribute, and the href of an `<a>`. */
function readAttribute(tag: Tag, name: string, value: string): void {
	if (name === 'hidden') tag.hidden = true;
	else if (name === 'aria-hidden') {
		if (value.trim().toLowerCase() === 'true') tag.hidden = true;
	} else if (name === 'style') {
		if (value.length <= MAX_STYLE_LENGTH) {
			const compact = `;${value.toLowerCase().replaceAll(/\s+/g, '')}`;
			if (compact.includes(';display:none') || compact.includes(';visibility:hidden')) tag.hidden = true;
		}
	} else if (name === 'href' && value.length <= MAX_HREF_LENGTH) tag.href = decodeEntities(value);
}

/**
 * Reads an open tag from `<` at `from`; null when it never ends (the caller
 * stops: an unterminated tag swallows the rest of the document anyway).
 */
function readTag(html: string, from: number): Tag | null {
	const nameStop = nameEnd(html, from + 1);
	const tag: Tag = { name: nameOf(html, from + 1, nameStop), end: nameStop, selfClosing: false, hidden: false, href: null };
	let index = nameStop;
	let slash = false;
	while (index < html.length) {
		const code = html.charCodeAt(index);
		if (code === 0x3e) {
			tag.end = index + 1;
			tag.selfClosing = slash;
			return tag;
		}
		if (isSpace(code) || code === 0x2f) {
			slash = code === 0x2f;
			index += 1;
			continue;
		}
		slash = false;
		// The first character is always taken, so a stray `=` cannot stall the loop.
		let stop = index + 1;
		while (stop < html.length) {
			const next = html.charCodeAt(stop);
			if (isSpace(next) || next === 0x3d || next === 0x3e || next === 0x2f) break;
			stop += 1;
		}
		const attribute = stop - index <= 11 ? html.slice(index, stop).toLowerCase() : '';
		index = stop;
		while (index < html.length && isSpace(html.charCodeAt(index))) index += 1;
		let value = '';
		if (html.charCodeAt(index) === 0x3d) {
			index += 1;
			while (index < html.length && isSpace(html.charCodeAt(index))) index += 1;
			const quote = html.charCodeAt(index);
			if (quote === 0x22 || quote === 0x27) {
				const close = html.indexOf(quote === 0x22 ? '"' : "'", index + 1);
				if (close < 0) return null;
				value = html.slice(index + 1, close);
				index = close + 1;
			} else {
				let valueEnd = index;
				while (valueEnd < html.length && !isSpace(html.charCodeAt(valueEnd)) && html.charCodeAt(valueEnd) !== 0x3e) valueEnd += 1;
				value = valueEnd - index <= MAX_HREF_LENGTH ? html.slice(index, valueEnd) : '';
				index = valueEnd;
			}
		}
		if (attribute) readAttribute(tag, attribute, value);
	}
	return null;
}

/** The index just past `</name ...>` at or after `from`; -1 when there is none. */
function endOfRawText(html: string, from: number, name: string): { text: number; after: number } | null {
	let at = html.indexOf('</', from);
	while (at >= 0) {
		if (html.slice(at + 2, at + 2 + name.length).toLowerCase() === name) {
			const after = html.indexOf('>', at + 2 + name.length);
			return { text: at, after: after < 0 ? html.length : after + 1 };
		}
		at = html.indexOf('</', at + 2);
	}
	return null;
}

export function htmlToText(html: string, { maxChars = DEFAULT_MAX_CHARS }: { maxChars?: number } = {}): HtmlText {
	const sink = new TextSink(maxChars, true);
	const titleSink = new TextSink(MAX_TITLE_CHARS, false);
	const hrefs: string[] = [];
	const stack: string[] = [];
	/** Index in `stack` of the hidden element we are inside, or -1. */
	let hiddenFrom = -1;
	let titled = false;
	let tokens = 0;
	let cursor = 0;

	const closeTo = (name: string): void => {
		const found = stack.lastIndexOf(name);
		if (found < 0) return;
		stack.length = found;
		if (hiddenFrom >= found) hiddenFrom = -1;
	};

	while (cursor < html.length) {
		if (html.charCodeAt(cursor) !== 0x3c) {
			const next = html.indexOf('<', cursor);
			const stop = next < 0 ? html.length : next;
			if (hiddenFrom < 0 && !sink.full) sink.push(decodeEntities(html.slice(cursor, stop)));
			cursor = stop;
			continue;
		}
		const code = html.charCodeAt(cursor + 1);
		if (isLetter(code)) {
			if (++tokens > MAX_TOKENS) break;
			const tag = readTag(html, cursor);
			if (!tag) break;
			cursor = tag.end;
			if (RAW_TEXT.has(tag.name) || tag.name === 'title') {
				const raw = endOfRawText(html, cursor, tag.name);
				if (!raw) break;
				if (tag.name === 'title' && !titled && !stack.includes('svg')) {
					titled = true;
					titleSink.push(decodeEntities(html.slice(cursor, raw.text)));
				}
				cursor = raw.after;
				continue;
			}
			if (tag.name === 'body') closeTo('head');
			const isVoid = VOID.has(tag.name) || tag.selfClosing;
			if (!isVoid) {
				if (stack.length >= MAX_DEPTH) break;
				stack.push(tag.name);
				if (hiddenFrom < 0 && (tag.hidden || DROPPED.has(tag.name))) hiddenFrom = stack.length - 1;
			}
			if (hiddenFrom >= 0 || (isVoid && tag.hidden)) continue;
			if (BLOCK.has(tag.name)) sink.breakLine();
			else if (tag.name === 'td' || tag.name === 'th') sink.space();
			if (tag.name === 'a' && tag.href !== null && hrefs.length < MAX_HREFS) hrefs.push(tag.href);
		} else if (code === 0x2f && isLetter(html.charCodeAt(cursor + 2))) {
			if (++tokens > MAX_TOKENS) break;
			const stop = nameEnd(html, cursor + 2);
			const close = html.indexOf('>', stop);
			if (close < 0) break;
			const name = nameOf(html, cursor + 2, stop);
			cursor = close + 1;
			closeTo(name);
			if (hiddenFrom < 0 && BLOCK.has(name)) sink.breakLine();
		} else if (code === 0x21 && html.startsWith('<!--', cursor)) {
			if (++tokens > MAX_TOKENS) break;
			const close = html.indexOf('-->', cursor + 4);
			if (close < 0) break;
			cursor = close + 3;
		} else if (code === 0x21 || code === 0x3f || code === 0x2f) {
			// A doctype, a processing instruction, a bogus comment: all end at `>`.
			const close = html.indexOf('>', cursor + 1);
			if (close < 0) break;
			cursor = close + 1;
		} else {
			// A `<` that opens nothing is text.
			if (hiddenFrom < 0) sink.push('<');
			cursor += 1;
		}
	}
	return { title: titleSink.value, text: sink.value, hrefs };
}

/** Plain text gets the same filter, never the tag parser: its `<` is just text. */
export function plainToText(text: string, maxChars = DEFAULT_MAX_CHARS): string {
	const sink = new TextSink(maxChars, true);
	for (const line of text.split('\n')) {
		if (sink.full) break;
		sink.breakLine();
		sink.push(line);
	}
	return sink.value;
}
