import { basename } from 'node:path';
import { HEADING_SEPARATOR } from '../indexer/sections.ts';
import {
	MAX_CHUNK_TOKENS,
	contentHash,
	estimateTokens,
	splitLongText,
} from '../indexer/chunker.ts';

/**
 * The sections of a Markdown document: the pack's unit of a chunk.
 *
 * A page is chunked from its block tree (indexer/sections.ts); a pack document
 * is a Markdown file, so its structure comes from its ATX headings. The two
 * meet at the same place: a heading path, a text, the same hash, and the same
 * long-section splitter (`splitLongText`) and token limit (`MAX_CHUNK_TOKENS`)
 * of the indexer. There is no second splitter.
 *
 * A `#` inside a fenced code block is code, not a heading: the fence state is
 * tracked line by line.
 */

/** One chunk of a document: where it is, its text, and its hash. */
export interface MarkdownChunk {
	/** The place of the chunk in the document: 0, 1, 2… */
	ord: number;
	/** The document title and the open headings: "<title> › <h1> › <h2>". */
	headingPath: string;
	/** The text under the heading, without the heading line. */
	content: string;
	/** The sha256 of the heading path and the text, in hex. */
	contentHash: string;
}

/** An ATX heading: one to six `#`, a space, and the text. */
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;

/** The opening of a fenced code block: three backticks or three tildes. */
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

/** One open heading of the document. */
interface Heading {
	level: number;
	text: string;
}

/** One section, before it is cut: its path and its body. */
interface RawSection {
	headingPath: string;
	body: string;
}

/** The text of a heading line, without the `#` and the closing hashes. */
function headingText(line: string): { level: number; text: string } | null {
	const match = HEADING.exec(line);
	if (!match) return null;
	return { level: (match[1] as string).length, text: (match[2] as string).trim() };
}

/** Whether a line opens or closes a fence, and the fence it names. */
function fenceOf(line: string): { char: string; length: number } | null {
	const match = FENCE.exec(line);
	if (!match) return null;
	const run = match[1] as string;
	return { char: run[0] as string, length: run.length };
}

/** The path of a section: the document title and the open headings. */
function headingPath(title: string, stack: readonly Heading[]): string {
	return [title, ...stack.map((heading) => heading.text)]
		.filter((part) => part.length > 0)
		.join(HEADING_SEPARATOR);
}

/**
 * The blocks of a document: the heading chain it is under, and its lines.
 *
 * The lines before the first heading belong to the document title itself; a
 * heading opens a section, and the headings it closes are the ones of its level
 * and below (only the open ancestors stay), exactly like the page walker.
 */
function readSections(path: string, text: string): { title: string; sections: RawSection[] } {
	const lines = text.split(/\r?\n/);
	const headings: { level: number; text: string }[] = [];
	let fence: { char: string; length: number } | null = null;
	let title: string | null = null;

	for (const line of lines) {
		const fenceLine = fenceOf(line);
		if (fenceLine) {
			if (fence === null) fence = fenceLine;
			else if (fenceLine.char === fence.char && fenceLine.length >= fence.length) fence = null;
			continue;
		}
		if (fence !== null) continue;
		const heading = headingText(line);
		if (heading && heading.level === 1 && title === null && heading.text.length > 0) {
			title = heading.text;
		}
	}

	const documentTitle = title ?? basename(path);
	const sections: RawSection[] = [];
	const stack: Heading[] = [];
	let rootSeen = false;
	let current: { headingPath: string; lines: string[] } | null = null;
	fence = null;

	const flush = (): void => {
		if (current === null) return;
		const body = current.lines.join('\n').trim();
		if (body.length > 0) sections.push({ headingPath: current.headingPath, body });
		current = null;
	};

	for (const line of lines) {
		const fenceLine = fenceOf(line);
		if (fenceLine) {
			if (fence === null) fence = fenceLine;
			else if (fenceLine.char === fence.char && fenceLine.length >= fence.length) fence = null;
			if (current === null) current = { headingPath: headingPath(documentTitle, stack), lines: [] };
			current.lines.push(line);
			continue;
		}
		if (fence === null) {
			const heading = headingText(line);
			if (heading) {
				flush();
				// The first level-1 heading IS the document title: it is
				// already the first part of every path, so it does not open a
				// second one. Every other heading opens its section.
				if (heading.level === 1 && !rootSeen) {
					rootSeen = true;
				} else {
					while (stack.length > 0 && (stack[stack.length - 1] as Heading).level >= heading.level) stack.pop();
					if (heading.text.length > 0) stack.push({ level: heading.level, text: heading.text });
				}
				current = { headingPath: headingPath(documentTitle, stack), lines: [] };
				continue;
			}
		}
		if (current === null) current = { headingPath: headingPath(documentTitle, stack), lines: [] };
		current.lines.push(line);
	}
	flush();

	return { title: documentTitle, sections };
}

/** The title of a document: its first level-1 heading, or its file name. */
export function markdownTitle(path: string, text: string): string {
	return readSections(path, text).title;
}

/** The chunks of one section: the paragraphs, packed to MAX_CHUNK_TOKENS. */
function chunkSection(headingPath: string, body: string): { headingPath: string; content: string }[] {
	const paragraphs = body
		.split(/\n[ \t]*\n/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0);
	const chunks: string[] = [];
	let pending: string[] = [];
	let pendingTokens = 0;

	const flush = (): void => {
		if (pending.length === 0) return;
		chunks.push(pending.join('\n\n'));
		pending = [];
		pendingTokens = 0;
	};

	for (const paragraph of paragraphs) {
		const tokens = estimateTokens(paragraph);
		if (tokens > MAX_CHUNK_TOKENS) {
			flush();
			// The indexer's own splitter: sentence ends, then hard at 2000 chars.
			chunks.push(...splitLongText(paragraph));
			continue;
		}
		if (pendingTokens + tokens > MAX_CHUNK_TOKENS) flush();
		pending.push(paragraph);
		pendingTokens += tokens;
	}
	flush();

	return chunks.map((content) => ({ headingPath, content }));
}

/**
 * The chunks of a Markdown document.
 *
 * The document is cut into sections at its headings, and a long section is cut
 * with the chunker's limits. The chunks keep the order of the document, and the
 * hash is `contentHash(headingPath, content)` — the same hash the indexer
 * writes, so a renamed heading re-embeds its chunks.
 */
export function markdownSections(path: string, text: string): MarkdownChunk[] {
	const chunks: MarkdownChunk[] = [];
	let ord = 0;
	for (const section of readSections(path, text).sections) {
		for (const chunk of chunkSection(section.headingPath, section.body)) {
			chunks.push({
				ord: ord++,
				headingPath: chunk.headingPath,
				content: chunk.content,
				contentHash: contentHash(chunk.headingPath, chunk.content),
			});
		}
	}
	return chunks;
}
