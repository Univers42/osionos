/**
 * Where page text lands: the one sink every web text passes through, so what a
 * model reads has been through the same filter whatever the tag it came from.
 *
 * It drops what a reader cannot see and a model can obey: C0/C1 controls and
 * the format characters (zero-width, bidi overrides, the tag block). It
 * collapses whitespace, honours explicit line breaks, stops at its limit
 * (never past it) and never emits `<`: the caller quotes the text into a
 * prompt, and a literal `<` is how a page forges the end of its own block.
 *
 * Caveat: entities are a small fixed table plus numeric references, and only
 * with a closing `;`. `&eacute;` and a bare `&amp` stay as written, which
 * under-decodes (harmless: the text is still data).
 */

const FORMAT_CHAR = /^\p{Cf}$/u;
const SPACE_SEPARATOR = /^\p{Zs}$/u;

/** U+2039 stands in for `<`: the page's meaning survives, its markup does not. */
const SAFE_LESS_THAN = '‹';

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	copy: '©',
	reg: '®',
	trade: '™',
	hellip: '…',
	mdash: '—',
	ndash: '–',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
	laquo: '«',
	raquo: '»',
	bull: '•',
	middot: '·',
	euro: '€',
	pound: '£',
	yen: '¥',
	cent: '¢',
	sect: '§',
	deg: '°',
	times: '×',
};

/** `&#x10FFFF;` is the longest reference: 8 characters after the `&`. */
const ENTITY_WINDOW = 10;

/** The text a reference stands for, or null when it is not one we know. */
function entityValue(body: string): string | null {
	if (body.startsWith('#')) {
		const hex = body[1] === 'x' || body[1] === 'X';
		const digits = body.slice(hex ? 2 : 1);
		if (!(hex ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/).test(digits)) return null;
		const code = Number.parseInt(digits, hex ? 16 : 10);
		// A surrogate or an out-of-range value is not text: it becomes nothing.
		if (!(code > 0 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) return '';
		return String.fromCodePoint(code);
	}
	return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : null;
}

/**
 * Decodes the references of a text.
 *
 * The look-ahead for `;` is bounded by ENTITY_WINDOW, so a run of `&` with no
 * `;` costs a constant per `&`, never a scan to the end of the text.
 */
export function decodeEntities(text: string): string {
	let at = text.indexOf('&');
	if (at < 0) return text;
	let out = '';
	let from = 0;
	while (at >= 0) {
		const limit = Math.min(at + ENTITY_WINDOW, text.length);
		let semicolon = -1;
		for (let index = at + 1; index < limit; index += 1) {
			if (text.charCodeAt(index) === 0x3b) {
				semicolon = index;
				break;
			}
		}
		const value = semicolon > 0 ? entityValue(text.slice(at + 1, semicolon)) : null;
		if (value === null) {
			out += text.slice(from, at + 1);
			from = at + 1;
		} else {
			out += text.slice(from, at) + value;
			from = semicolon + 1;
		}
		at = text.indexOf('&', from);
	}
	return out + text.slice(from);
}

export class TextSink {
	private text = '';
	/** 0 nothing owed, 1 a space, 2 a line break. */
	private owed = 0;
	full: boolean;
	private readonly limit: number;
	private readonly keepLines: boolean;

	constructor(limit: number, keepLines: boolean) {
		this.limit = limit;
		this.keepLines = keepLines;
		this.full = limit <= 0;
	}

	get value(): string {
		return this.text;
	}

	breakLine(): void {
		this.owed = Math.max(this.owed, this.keepLines ? 2 : 1);
	}

	space(): void {
		this.owed = Math.max(this.owed, 1);
	}

	/** Takes raw text (entities already decoded) one code point at a time. */
	push(raw: string): void {
		for (const char of raw) {
			if (this.full) return;
			const code = char.codePointAt(0) as number;
			if (code < 0x80) {
				if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d || code === 0x0c) this.space();
				else if (code >= 0x20 && code !== 0x7f) this.add(char === '<' ? SAFE_LESS_THAN : char);
				continue;
			}
			if (code <= 0x9f) continue;
			if (code === 0xa0 || code === 0x2028 || code === 0x2029 || SPACE_SEPARATOR.test(char)) this.space();
			else if (!FORMAT_CHAR.test(char)) this.add(char);
		}
	}

	private add(char: string): void {
		const separator = this.text.length > 0 ? this.owed : 0;
		this.owed = 0;
		if (this.text.length + (separator ? 1 : 0) + char.length > this.limit) {
			this.full = true;
			return;
		}
		if (separator) this.text += separator === 2 ? '\n' : ' ';
		this.text += char;
		if (this.text.length >= this.limit) this.full = true;
	}
}
