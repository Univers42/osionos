/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-publish-snapshot.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The publish-time snapshot of a page's block tree.
 *
 * A public reader gets a COPY stored in osionos_published_pages, so whatever is
 * copied here is readable by anyone with the token. The copy is an ALLOWLIST:
 * only block types that carry their own text survive, and inside them only the
 * fields the read-only renderer uses. Everything else — child pages, databases,
 * link-to-page blocks, embeds, media, transclusions — is dropped rather than
 * sanitised field by field, because a type this file does not know is a type
 * whose fields this file cannot reason about.
 *
 * Inline content is the editor's markdown-ish source. Formatting marks stay
 * byte-for-byte; internal page mentions (`[[page:<uuid>]]` and `page://` links)
 * are removed entirely because their visible text is a live lookup of another
 * page's title, and no href survives at all in P1 (the app origin is not passed
 * here, so an external link could point back at a private page).
 *
 * A formula-gated block (`visibleWhen`) or layout cell (`visibilityFormula`)
 * is published only when the owner's view showed it: the client evaluates the
 * formulas against the page's properties and sends the ids it showed (`shown`).
 * The formula itself is never copied — a public reader has no properties to
 * evaluate it with — and a gated id the publish did not name stays private.
 *
 * Caveat: P1 loses images, embeds, bookmarks and every link (the text stays).
 * The allowlist must grow with every new text-carrying block type, otherwise
 * that type silently disappears from published pages. A gated item follows the
 * owner's view at publish time: a property edited later does not re-gate the
 * published copy until the page is published again.
 */

const ALLOWED_TYPES = new Set([
	'paragraph',
	'heading_1',
	'heading_2',
	'heading_3',
	'heading_4',
	'heading_5',
	'heading_6',
	'bulleted_list',
	'numbered_list',
	'to_do',
	'quote',
	'callout',
	'code',
	'divider',
	'toggle',
	'layout',
]);

// Fields the read-only renderer actually reads. Anything else (embed snapshots,
// database ids, button programs, due dates) is not copied; a layout's grid and
// cells go through their own allowlists below.
const KEPT_FIELDS = [
	'id',
	'checked',
	'language',
	'fileName',
	'lineNumbers',
	'codeTheme',
	'color',
	'headingLevel',
	'collapsed',
	'textColor',
	'backgroundColor',
];

const MAX_DEPTH = 32;
const MAX_NODES = 20_000;

const LAYOUT_CONFIG_FIELDS = ['columns', 'rows', 'rowHeight', 'gap', 'columnGap', 'rowGap'];
const CELL_GRID_FIELDS = ['colStart', 'colSpan', 'rowStart', 'rowSpan'];
const CELL_COLOR_FIELDS = ['tint', 'backgroundColor', 'textColor'];
const CELL_ENUMS = {
	sizing: new Set(['fixed', 'auto-height', 'auto-width', 'auto']),
	padding: new Set(['compact', 'comfortable', 'spacious']),
	fontSize: new Set(['small', 'base', 'large']),
};
// A cell colour is a CSS value painted as `background`, so a url() or an
// image-set() would make every public reader fetch it. Only these functions
// (and no quote, colon or slash) are kept.
const COLOR_FUNCTIONS = new Set(['var', 'color-mix', 'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);

function linkTarget(raw) {
	const text = String(raw ?? '').trim();
	if (text.startsWith('<')) {
		const end = text.indexOf('>');
		if (end !== -1) return text.slice(1, end);
	}
	return text.split(/\s+/)[0] ?? '';
}

function isPageLink(target) {
	return /^page:/i.test(target);
}

/**
 * Strip what must not become public, keep every formatting mark as written.
 * One pass over the string per rule; no JSON-wide scan and no title lookups.
 */
function publishInline(source) {
	if (typeof source !== 'string' || source === '') return '';
	return source
		// Inline images carry an asset reference and alt text, not readable page text.
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		// A link keeps only its visible label. An internal page link's label is
		// another page's title (or its id), so the whole node goes.
		.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (match, label, rawTarget) => (
			isPageLink(linkTarget(rawTarget)) ? '' : label
		))
		// The editor's page mention: no visible text of its own, only a live lookup.
		.replace(/\[\[page:[^\]]*\]\]/gi, '')
		// A raw internal target left in plain text would still name another page.
		.replace(/page:\/\/[0-9a-z-]+/gi, '');
}

function isGatedOut(formula, id, state) {
	return typeof formula === 'string' && formula.trim() !== '' && !(typeof id === 'string' && state.shown.has(id));
}

function isFiniteNumber(value) {
	return typeof value === 'number' && Number.isFinite(value);
}

function safeColor(value) {
	if (typeof value !== 'string' || !/^[a-z0-9#%(),.\s-]{1,160}$/i.test(value)) return undefined;
	for (const [, name] of value.matchAll(/([a-z-]+)\s*\(/gi)) {
		if (!COLOR_FUNCTIONS.has(name.toLowerCase())) return undefined;
	}
	return value;
}

function snapshotBlocks(blocks, depth, state) {
	const out = [];
	for (const block of blocks) {
		const kept = snapshotBlock(block, depth, state);
		if (kept) out.push(kept);
		if (state.nodes >= MAX_NODES) break;
	}
	return out;
}

function snapshotLayoutConfig(config) {
	if (!config || typeof config !== 'object') return undefined;
	const next = {};
	for (const field of LAYOUT_CONFIG_FIELDS) if (isFiniteNumber(config[field])) next[field] = config[field];
	return next;
}

function cellStyleFields(cell, next) {
	if (cell.offset && isFiniteNumber(cell.offset.x) && isFiniteNumber(cell.offset.y)) next.offset = { x: cell.offset.x, y: cell.offset.y };
	for (const [field, allowed] of Object.entries(CELL_ENUMS)) if (allowed.has(cell[field])) next[field] = cell[field];
	if (typeof cell.wrap === 'boolean') next.wrap = cell.wrap;
	for (const field of CELL_COLOR_FIELDS) {
		const color = safeColor(cell[field]);
		if (color !== undefined) next[field] = color;
	}
}

/** A layout cell: its grid slot, its look, its text and its blocks — never its formula or section. */
function snapshotCell(cell, depth, state) {
	if (state.nodes >= MAX_NODES) return null;
	state.nodes += 1;
	if (!cell || typeof cell !== 'object' || typeof cell.id !== 'string') return null;
	if (!CELL_GRID_FIELDS.every((field) => isFiniteNumber(cell[field]))) return null;
	if (isGatedOut(cell.visibilityFormula, cell.id, state)) return null;
	const next = { id: cell.id };
	for (const field of CELL_GRID_FIELDS) next[field] = cell[field];
	if (typeof cell.label === 'string') next.label = publishInline(cell.label);
	if (typeof cell.content === 'string') next.content = publishInline(cell.content);
	cellStyleFields(cell, next);
	next.blocks = Array.isArray(cell.blocks) ? snapshotBlocks(cell.blocks, depth + 1, state) : [];
	return next;
}

function snapshotLayout(block, depth, state, next) {
	const config = snapshotLayoutConfig(block.layoutConfig);
	if (config) next.layoutConfig = config;
	const cells = [];
	for (const cell of Array.isArray(block.layoutCells) ? block.layoutCells : []) {
		const kept = snapshotCell(cell, depth, state);
		if (kept) cells.push(kept);
	}
	next.layoutCells = cells;
}

function snapshotBlock(block, depth, state) {
	if (depth > MAX_DEPTH || state.nodes >= MAX_NODES) return null;
	state.nodes += 1;
	if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
	if (!ALLOWED_TYPES.has(block.type)) return null;
	if (isGatedOut(block.visibleWhen, block.id, state)) return null;

	const next = {};
	if (typeof block.id === 'string') next.id = block.id;
	next.type = block.type;
	if (typeof block.content === 'string') next.content = publishInline(block.content);
	for (const field of KEPT_FIELDS) {
		if (field !== 'id' && Object.hasOwn(block, field)) next[field] = block[field];
	}
	if (block.type === 'layout') snapshotLayout(block, depth, state, next);
	if (Array.isArray(block.children) && block.children.length > 0) {
		const children = snapshotBlocks(block.children, depth + 1, state);
		if (children.length > 0) next.children = children;
	}
	return next;
}

/**
 * A publish-safe copy of `content`: allowlisted blocks, sanitised inline text.
 * `shown` holds the ids of the gated blocks and cells the owner's view showed.
 */
export function publishSnapshot(content, { shown = new Set() } = {}) {
	if (!Array.isArray(content)) return [];
	return snapshotBlocks(content, 1, { nodes: 0, shown });
}
