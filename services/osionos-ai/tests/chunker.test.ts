import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkPage, estimateTokens, MAX_CHUNK_TOKENS } from '../src/indexer/chunker.ts';

/**
 * The chunker, on its own: no database, no service, no clock. Everything the
 * worker does with the chunks is decided here.
 */

/** A block of a page: the shape the app stores. */
function block(id: string, type: string, content: string, children?: unknown[]): unknown {
	return { id, type, content, ...(children ? { children } : {}) };
}

/** A text of about `tokens` tokens. */
function textOf(tokens: number, marker = 'x'): string {
	return marker.repeat(tokens * 4);
}

describe('the chunker', () => {
	it('opens a section at every heading, and the path carries the open ancestors', () => {
		const chunks = chunkPage({
			title: 'Roadmap',
			content: [
				block('b1', 'paragraph', 'Before the first heading.'),
				block('b2', 'heading_1', 'First'),
				block('b3', 'paragraph', 'The body of the first section.'),
				block('b4', 'heading_2', 'Second'),
				block('b5', 'paragraph', 'The body of the second section.'),
				block('b6', 'heading_1', 'Third'),
				block('b7', 'paragraph', 'The body of the third section.'),
			],
		});
		assert.deepEqual(
			chunks.map((chunk) => chunk.headingPath),
			['Roadmap', 'Roadmap › First', 'Roadmap › First › Second', 'Roadmap › Third'],
		);
		// The order of the page is kept.
		assert.deepEqual(
			chunks.map((chunk) => chunk.ord),
			[0, 1, 2, 3],
		);
		// The first block of a chunk is the block it starts at.
		assert.deepEqual(
			chunks.map((chunk) => chunk.blockId),
			['b1', 'b2', 'b4', 'b6'],
		);
	});

	it('keeps the children after their parent, in document order', () => {
		const chunks = chunkPage({
			title: 'Tree',
			content: [
				block('parent', 'toggle', 'The parent', [
					block('child-1', 'paragraph', 'The first child.'),
					block('child-2', 'heading_1', 'A heading in the toggle', [
						block('grand-child', 'paragraph', 'The grand child.'),
					]),
				]),
				block('after', 'paragraph', 'After the toggle.'),
			],
		});
		const texts = chunks.map((chunk) => chunk.content);
		// The heading of the child opens a section of its own.
		assert.deepEqual(
			chunks.map((chunk) => chunk.headingPath),
			['Tree', 'Tree › A heading in the toggle'],
		);
		// The parent comes before its child, in the same section.
		assert.ok(texts[0].includes('The parent'));
		assert.ok(texts[0].includes('The first child.'));
		assert.ok(texts[0].indexOf('The parent') < texts[0].indexOf('The first child.'));
		// The grand child comes after the heading that opened its section, and
		// the block that follows the toggle comes after it too.
		assert.ok(texts[1].includes('The grand child.'));
		assert.ok(texts[1].includes('After the toggle.'));
		assert.ok(texts[1].indexOf('The grand child.') < texts[1].indexOf('After the toggle.'));
	});

	it('cuts a long section into chunks of about 300 to 500 tokens', () => {
		const blocks = [];
		for (let index = 0; index < 20; index += 1) {
			blocks.push(block(`b${index}`, 'paragraph', textOf(100, `block ${index} `)));
		}
		const chunks = chunkPage({ title: 'Long', content: blocks });
		assert.ok(chunks.length > 1, 'a long section is cut');
		for (const chunk of chunks) {
			const tokens = estimateTokens(chunk.content);
			assert.ok(tokens <= MAX_CHUNK_TOKENS, `a chunk of ${tokens} tokens is too big`);
			assert.ok(tokens >= 300, `a chunk of ${tokens} tokens is too small`);
		}
		// The chunks keep the order of the blocks.
		assert.ok(chunks[0].content.includes('block 0 '));
		assert.ok(chunks[chunks.length - 1].content.includes('block 19 '));
	});

	it('skips the empty blocks, and keeps the ones that hold something', () => {
		const chunks = chunkPage({
			title: 'Empty',
			content: [
				block('b1', 'paragraph', ''),
				block('b2', 'paragraph', '   '),
				block('b3', 'paragraph', 'The only text.'),
				block('b4', 'paragraph', ''),
			],
		});
		assert.equal(chunks.length, 1);
		assert.equal(chunks[0].content, 'The only text.');
		assert.equal(chunks[0].blockId, 'b3');
	});

	it('changes the hash when the heading changes, even when the text does not', () => {
		const content = [block('b1', 'heading_1', 'First'), block('b2', 'paragraph', 'The same text.')];
		const before = chunkPage({ title: 'Page', content });
		const after = chunkPage({
			title: 'Page',
			content: [block('b1', 'heading_1', 'Another name'), block('b2', 'paragraph', 'The same text.')],
		});
		assert.notEqual(before[0].contentHash, after[0].contentHash);
		assert.notEqual(before[0].headingPath, after[0].headingPath);
		// The text under the heading did not change.
		assert.ok(before[0].content.endsWith('The same text.'));
		assert.ok(after[0].content.endsWith('The same text.'));
		// The hash is the one of the path and the text.
		assert.equal(before[0].contentHash.length, 64);
	});

	it('cuts a block that is too long on its sentence ends, then hard at 2000 characters', () => {
		const sentence = 'This is a sentence of the block. ';
		const chunks = chunkPage({
			title: 'Long block',
			content: [block('b1', 'paragraph', sentence.repeat(200))],
		});
		assert.ok(chunks.length > 1, 'the block is cut');
		for (const chunk of chunks) {
			assert.ok(chunk.content.length <= 2000, `a piece of ${chunk.content.length} characters is too long`);
		}
		assert.ok(chunks[0].content.endsWith('block.'), 'the pieces end on a sentence');
	});

	it('refuses a content that is not a block array', () => {
		assert.throws(() => chunkPage({ title: 'Broken', content: { blocks: [] } }), /block_array/);
	});

	it('reads no block of a page with no content', () => {
		assert.deepEqual(chunkPage({ title: 'Empty', content: [] }), []);
	});
});
