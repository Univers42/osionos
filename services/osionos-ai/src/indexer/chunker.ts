/**
 * The chunker: a page's block tree in, the chunks of the page out.
 *
 * Pure: no database, no clock, no network. The worker reads the page row,
 * hands it to the chunker, and writes back what comes out. Everything that
 * decides WHAT is indexed lives here, so it can be tested without a server.
 *
 * The shape of the input is the shape the app stores: a JSONB array of blocks
 * (src/entities/block/model/types.ts), each one `{ id, type, content, children }`.
 * A block's text is its `content` string; nothing else is read.
 *
 * The rules:
 *   - the blocks are walked depth-first, in document order: a parent, then its
 *     children;
 *   - a heading of level 1, 2 or 3 opens a SECTION; the text under it belongs
 *     to that section;
 *   - the path of a section is the title of the page and the OPEN headings:
 *     "<title> › <h1> › <h2>";
 *   - a section becomes chunks of about 300 to 500 tokens, cut on the block
 *     boundaries; a block that is too long on its own is cut on its sentence
 *     ends, then hard at 2000 characters.
 */

import { createHash } from 'node:crypto';

/** The block of a page, as the JSONB of osionos_pages.content holds it. */
export interface PageBlock {
	id?: unknown;
	type?: unknown;
	content?: unknown;
	children?: unknown;
}

/** The page the chunker reads: its title and its block tree. */
export interface PageDocument {
	title: string;
	content: unknown;
}

/** One chunk of a page: its place in the page, and its text. */
export interface PageChunk {
	/** The place of the chunk in the page: 0, 1, 2… */
	ord: number;
	/** The id of the FIRST block of the chunk. */
	blockId: string;
	/** The open ancestors of the chunk: "<title> › <h1> › <h2>". */
	headingPath: string;
	/** The text of the chunk: its blocks, one per line. */
	content: string;
	/** The sha256 of the heading path and the text, in hex. */
	contentHash: string;
}

/**
 * The tokens of a text, estimated.
 *
 * Caveat: four characters per token under-counts CJK and code, and over-counts
 * short words. The estimate decides where the chunks are cut, nothing more:
 * the real limit of the model (512 tokens) is enforced by the embedding service
 * itself, which truncates what it receives.
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/** The smallest chunk the chunker aims at. */
export const MIN_CHUNK_TOKENS = 300;

/** The biggest chunk the chunker aims at. */
export const MAX_CHUNK_TOKENS = 500;

/** The hard cut of a block that is too long on its own. */
export const HARD_SPLIT_CHARS = 2000;

/** The separator of the heading path: the page title, then the headings. */
export const HEADING_SEPARATOR = ' › ';

/**
 * The heading types that open a section: heading_1, heading_2 and heading_3.
 * heading_4 to heading_6 are text like any other block: they are small, and
 * a section per small heading would make the chunks meaningless.
 */
const HEADING_LEVELS: Readonly<Record<string, number>> = Object.freeze({
	heading_1: 1,
	heading_2: 2,
	heading_3: 3,
});

/** A block of a section: its id and its text. */
interface TextBlock {
	id: string;
	text: string;
}

/** A section of a page: its path, and the blocks under it. */
interface Section {
	headingPath: string;
	blocks: TextBlock[];
}

/** The id of a block: a string, or nothing. */
function blockId(block: PageBlock): string {
	return typeof block.id === 'string' ? block.id : '';
}

/**
 * The blocks of a page, in document order: a parent, then its children.
 *
 * The tree is walked depth-first, so the children of a block come right after
 * it. A block that is not an object is skipped: the tree is data, and data
 * from an old version of the app may hold things the chunker does not know.
 */
export function pageBlocks(content: unknown): PageBlock[] {
	const blocks: PageBlock[] = [];
	const walk = (nodes: unknown): void => {
		if (!Array.isArray(nodes)) return;
		for (const node of nodes) {
			if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
			const block = node as PageBlock;
			blocks.push(block);
			walk(block.children);
		}
	};
	walk(content);
	return blocks;
}

/** The path of a section: the title of the page and the open headings. */
function headingPath(title: string, stack: readonly { level: number; text: string }[]): string {
	const parts = [title.trim(), ...stack.map((entry) => entry.text)].filter((part) => part.length > 0);
	return parts.join(HEADING_SEPARATOR);
}

/**
 * The hash of a chunk: its heading path and its text.
 *
 * The heading path is IN the hash: a renamed heading must re-embed its
 * chunks, even when the text under it did not change by a single character.
 */
export function contentHash(path: string, content: string): string {
	return createHash('sha256').update(`${path}\n${content}`, 'utf8').digest('hex');
}

/**
 * The sentences of a text: the pieces that end with a full stop, a question
 * mark or an exclamation mark. The end of the sentence belongs to it.
 */
function splitSentences(text: string): string[] {
	const sentences: string[] = [];
	const pattern = /[^.!?…]*[.!?…]+["'’”)\]]*\s*/g;
	let cursor = 0;
	let match: RegExpExecArray | null = pattern.exec(text);
	while (match !== null) {
		if (match[0].length === 0) {
			pattern.lastIndex += 1;
		} else {
			sentences.push(text.slice(cursor, pattern.lastIndex));
			cursor = pattern.lastIndex;
		}
		match = pattern.exec(text);
	}
	if (cursor < text.length) sentences.push(text.slice(cursor));
	return sentences.filter((sentence) => sentence.length > 0);
}

/**
 * The pieces of a block that is too long: the sentences are packed together
 * up to 2000 characters, and a sentence that is longer than that on its own
 * is cut hard.
 */
export function splitLongText(text: string): string[] {
	const pieces: string[] = [];
	let current = '';
	for (const sentence of splitSentences(text)) {
		if (sentence.length > HARD_SPLIT_CHARS) {
			if (current.length > 0) {
				pieces.push(current);
				current = '';
			}
			for (let index = 0; index < sentence.length; index += HARD_SPLIT_CHARS) {
				pieces.push(sentence.slice(index, index + HARD_SPLIT_CHARS));
			}
			continue;
		}
		if (current.length + sentence.length > HARD_SPLIT_CHARS) {
			pieces.push(current);
			current = sentence;
			continue;
		}
		current += sentence;
	}
	if (current.length > 0) pieces.push(current);
	return pieces.map((piece) => piece.trim()).filter((piece) => piece.length > 0);
}

/** A chunk of a section: the blocks it holds, joined. */
function makeChunk(blocks: readonly TextBlock[], path: string): Omit<PageChunk, 'ord'> {
	const content = blocks.map((block) => block.text).join('\n');
	return {
		blockId: blocks[0]?.id ?? '',
		headingPath: path,
		content,
		contentHash: contentHash(path, content),
	};
}

/**
 * The chunks of a section.
 *
 * The blocks are packed until the next one would pass 500 tokens. A block
 * that is too long on its own is cut on its sentence ends, then hard at 2000
 * characters, and each piece is a chunk of its own.
 */
function chunkSection(section: Section): Omit<PageChunk, 'ord'>[] {
	const chunks: Omit<PageChunk, 'ord'>[] = [];
	let pending: TextBlock[] = [];
	let pendingTokens = 0;

	const flush = (): void => {
		if (pending.length === 0) return;
		chunks.push(makeChunk(pending, section.headingPath));
		pending = [];
		pendingTokens = 0;
	};

	for (const block of section.blocks) {
		const tokens = estimateTokens(block.text);
		if (tokens > MAX_CHUNK_TOKENS) {
			flush();
			for (const piece of splitLongText(block.text)) {
				chunks.push(makeChunk([{ id: block.id, text: piece }], section.headingPath));
			}
			continue;
		}
		if (pendingTokens + tokens > MAX_CHUNK_TOKENS) flush();
		pending.push(block);
		pendingTokens += tokens;
	}
	flush();

	// A last chunk that is tiny is folded back into the one before it, when the
	// two still fit: a chunk of twenty tokens is a bad neighbour in a vector
	// index.
	const last = chunks[chunks.length - 1];
	if (chunks.length > 1 && last && estimateTokens(last.content) < MIN_CHUNK_TOKENS) {
		const previous = chunks[chunks.length - 2];
		if (estimateTokens(previous.content) + estimateTokens(last.content) <= MAX_CHUNK_TOKENS) {
			chunks[chunks.length - 2] = makeChunk(
				[
					{ id: previous.blockId, text: previous.content },
					{ id: last.blockId, text: last.content },
				],
				section.headingPath,
			);
			chunks.pop();
		}
	}

	return chunks;
}

/**
 * The chunks of a page.
 *
 * The page is cut into sections at its headings, and every section is cut into
 * chunks. The chunks keep the order of the page: `ord` is their place in it.
 */
export function chunkPage(page: PageDocument): PageChunk[] {
	if (page.content !== null && page.content !== undefined && !Array.isArray(page.content)) {
		// The content of a page is a block array. Anything else is a broken
		// row: the worker must not empty the index of a page it cannot read.
		throw new Error('page_content_is_not_a_block_array');
	}

	const title = typeof page.title === 'string' ? page.title : '';
	const sections: Section[] = [];
	const stack: { level: number; text: string }[] = [];
	let current: Section | null = null;

	for (const block of pageBlocks(page.content)) {
		const text = typeof block.content === 'string' ? block.content.trim() : '';
		const type = typeof block.type === 'string' ? block.type : '';
		const level = HEADING_LEVELS[type];
		if (level !== undefined) {
			// A heading opens a section. The headings it closes are the ones of
			// its level and of the levels below: only the open ancestors stay.
			while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
			if (text.length > 0) stack.push({ level, text });
			current = { headingPath: headingPath(title, stack), blocks: [] };
			sections.push(current);
			if (text.length > 0) current.blocks.push({ id: blockId(block), text });
			continue;
		}
		if (text.length === 0) continue;
		if (current === null) {
			current = { headingPath: headingPath(title, stack), blocks: [] };
			sections.push(current);
		}
		current.blocks.push({ id: blockId(block), text });
	}

	const chunks: PageChunk[] = [];
	let ord = 0;
	for (const section of sections) {
		for (const chunk of chunkSection(section)) {
			chunks.push({ ...chunk, ord: ord++ });
		}
	}
	return chunks;
}
