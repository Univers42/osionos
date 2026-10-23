/**
 * The sections of a page: where a section starts, and what its path is.
 *
 * Pure: no database, no clock, no network. The blocks are walked in the order
 * of the page, and a heading opens a section. The chunker cuts the sections
 * into chunks; this module decides what a section holds.
 *
 * The shape of the input is the shape the app stores: a JSONB array of blocks
 * (src/entities/block/model/types.ts), each one `{ id, type, content, children }`.
 * A block's text is its `content` string; nothing else is read.
 */

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

/** A block of a section: its id and its text. */
export interface TextBlock {
	id: string;
	text: string;
}

/** A section of a page: its path, and the blocks under it. */
export interface Section {
	headingPath: string;
	blocks: TextBlock[];
}

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

/**
 * The text of a block. An image block's `content` is a capability path, not
 * prose, so it is never indexed; its alt text is, as `Image: <alt>`.
 */
function blockText(block: PageBlock, type: string): string {
	if (type === 'image') {
		const alt = (block as { mediaAlt?: unknown }).mediaAlt;
		const clean = typeof alt === 'string' ? alt.trim() : '';
		return clean ? `Image: ${clean}` : '';
	}
	return typeof block.content === 'string' ? block.content.trim() : '';
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
 * The sections of a page: the blocks, in the order of the page, under the
 * heading that opened them.
 *
 * A heading of level 1, 2 or 3 opens a section; the text under it belongs to
 * that section. The path of a section is the title of the page and the OPEN
 * headings: "<title> › <h1> › <h2>".
 */
export function pageSections(page: PageDocument): Section[] {
	const title = typeof page.title === 'string' ? page.title : '';
	const sections: Section[] = [];
	const stack: { level: number; text: string }[] = [];
	let current: Section | null = null;

	for (const block of pageBlocks(page.content)) {
		const type = typeof block.type === 'string' ? block.type : '';
		const text = blockText(block, type);
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

	return sections;
}
