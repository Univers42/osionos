/**
 * The chunker: a page's sections in, the chunks of the page out.
 *
 * Pure: no database, no clock, no network. The worker reads the page row,
 * hands it to the chunker, and writes back what comes out. Everything that
 * decides WHAT is indexed lives here, so it can be tested without a server.
 *
 * The sections come from sections.ts (the blocks of the page, and the headings
 * that open them); this module cuts them.
 *
 * The rules:
 *   - a section becomes chunks of about 300 to 500 tokens, cut on the block
 *     boundaries; a block that is too long on its own is cut on its sentence
 *     ends, then hard at 2000 characters.
 */

import { createHash } from 'node:crypto';
import { pageSections } from './sections.ts';
import type { PageDocument, Section, TextBlock } from './sections.ts';

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

	const chunks: PageChunk[] = [];
	let ord = 0;
	for (const section of pageSections(page)) {
		for (const chunk of chunkSection(section)) {
			chunks.push({ ...chunk, ord: ord++ });
		}
	}
	return chunks;
}
