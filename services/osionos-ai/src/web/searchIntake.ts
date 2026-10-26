import { z } from 'zod';
import { sanitizeText } from '../mcpClient/schema.ts';
import { attributeText, quotedData } from '../runs/sources.ts';
import { webUrl } from './webUrl.ts';

/**
 * What goes into the web search and what comes back (web C353, C354).
 *
 * A result is written by a stranger: its URL and its words are attacker
 * text. The URL must pass the same `webUrl` as a fetch (a result that points
 * at `file:`, a private name or a literal address is dropped, so the model is
 * never offered a link the fetch tool would refuse), the words lose their
 * control and format characters, and the render quotes them as data so a
 * title cannot close its own block.
 *
 * Caveat: the title and snippet limits count code points, not glyphs; an
 * emoji sequence may be cut mid-cluster. Dedupe is by canonical URL only:
 * the same page behind two URLs (a tracking parameter) stays twice.
 */
export const MAX_QUERY_CHARS = 200;
export const DEFAULT_COUNT = 5;
export const MAX_COUNT = 8;
const MAX_TITLE_CHARS = 200;
const MAX_SNIPPET_CHARS = 400;

/** `.strict()`: an engine, a category or a page the model invents is refused, not ignored. */
export const searchInput = z
	.object({
		query: z.string(),
		count: z.number().int().min(1).max(MAX_COUNT).default(DEFAULT_COUNT),
	})
	.strict();

/** The words of a stranger as one line: no control or format characters, one space between words. */
function oneLine(text: string, max: number): string {
	return [...sanitizeText(text).replace(/\s+/gu, ' ')].slice(0, max).join('').trim();
}

/** The query, cleaned, or null when nothing searchable is left or it is too long. */
export function cleanQuery(raw: string): string | null {
	const query = sanitizeText(raw).replace(/\s+/gu, ' ');
	const length = [...query].length;
	return length >= 1 && length <= MAX_QUERY_CHARS ? query : null;
}

export interface WebResult {
	n: number;
	url: string;
	domain: string;
	title: string;
	snippet: string;
}

function textField(entry: Record<string, unknown>, key: string): string {
	const value = entry[key];
	return typeof value === 'string' ? value : '';
}

/** The results that are safe to show: numbered from 1 after the filtering, at most `count`. */
export function intakeResults(raw: unknown[], count: number): WebResult[] {
	const seen = new Set<string>();
	const results: WebResult[] = [];
	for (const entry of raw) {
		if (results.length >= count) break;
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
		const record = entry as Record<string, unknown>;
		const url = webUrl(textField(record, 'url'));
		if (!url || seen.has(url.href)) continue;
		seen.add(url.href);
		results.push({
			n: results.length + 1,
			url: url.href,
			domain: url.hostname,
			title: oneLine(textField(record, 'title'), MAX_TITLE_CHARS) || url.hostname,
			snippet: oneLine(textField(record, 'content'), MAX_SNIPPET_CHARS),
		});
	}
	return results;
}

/** One quoted block per result: attributes and body can never be markup. */
export function renderResults(results: readonly WebResult[]): string {
	return results
		.map((result) => {
			const body = result.snippet ? `${result.title} — ${result.snippet}` : result.title;
			return `<web_result n="${result.n}" url="${attributeText(result.url)}" domain="${attributeText(result.domain)}">${quotedData(body)}</web_result>`;
		})
		.join('\n');
}
