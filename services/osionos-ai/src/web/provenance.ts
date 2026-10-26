import { webUrl } from './webUrl.ts';

/**
 * The URLs a run may fetch (web C349, C350).
 *
 * web_fetch takes a URL only when its canonical form is in this set: a URL the
 * human typed in the message of THIS run, a URL of a search result of this
 * run, or a link of a page this run fetched. A URL the model composed — with a
 * workspace secret in its query, say — is in none of them, and the fetch never
 * leaves. Workspace pages, attachments, the history, MCP output, memory and the
 * continuation's sentence are not sources: the run only ever adds the three
 * kinds above.
 *
 * The set is capped at MAX_PROVENANCE_URLS; past it, new URLs are not added.
 * Residual, stated by the verdict (Q1): a page offering N links lets the model
 * leak log2(N) bits per fetch by choosing one, about 59 bits per run at the
 * caps.
 *
 * Caveat: a typed URL is found by its `https://` prefix, up to the first
 * space, quote or angle bracket, with trailing punctuation trimmed: a URL
 * typed without its scheme, or one that legitimately ends in `)` or `.`, is
 * not a source as typed.
 */
export const MAX_PROVENANCE_URLS = 500;

const TYPED_URL = /https:\/\/[^\s<>"'`]+/giu;
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', ')', ']', '}']);

/** The URL without the punctuation of the sentence it ends; a loop, so a run of dots stays linear. */
function trimSentenceEnd(raw: string): string {
	let end = raw.length;
	while (end > 0 && TRAILING_PUNCTUATION.has(raw[end - 1] as string)) end -= 1;
	return raw.slice(0, end);
}

export class UrlProvenance {
	private readonly urls = new Set<string>();

	add(raw: string): void {
		if (this.urls.size >= MAX_PROVENANCE_URLS) return;
		const url = webUrl(raw);
		if (url) this.urls.add(url.href);
	}

	/** The URLs a human typed: called with the text of the user's message, and nothing else. */
	addTyped(text: string): void {
		for (const match of text.matchAll(TYPED_URL)) this.add(trimSentenceEnd(match[0]));
	}

	/** The canonical URL when the run may fetch it, else null. */
	allows(raw: string): URL | null {
		const url = webUrl(raw);
		return url && this.urls.has(url.href) ? url : null;
	}

	get size(): number {
		return this.urls.size;
	}
}
