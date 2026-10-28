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
 * Caveat: P1 loses images, embeds, bookmarks and every link (the text stays).
 * The allowlist must grow with every new text-carrying block type, otherwise
 * that type silently disappears from published pages.
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
]);

// Fields the read-only renderer actually reads. Anything else (embed snapshots,
// database ids, button programs, layout cells, due dates) is not copied.
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

function snapshotBlock(block, depth, state) {
	if (depth > MAX_DEPTH || state.nodes >= MAX_NODES) return null;
	state.nodes += 1;
	if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
	if (!ALLOWED_TYPES.has(block.type)) return null;

	const next = {};
	if (typeof block.id === 'string') next.id = block.id;
	next.type = block.type;
	if (typeof block.content === 'string') next.content = publishInline(block.content);
	for (const field of KEPT_FIELDS) {
		if (field !== 'id' && Object.hasOwn(block, field)) next[field] = block[field];
	}
	if (Array.isArray(block.children) && block.children.length > 0) {
		const children = [];
		for (const child of block.children) {
			const kept = snapshotBlock(child, depth + 1, state);
			if (kept) children.push(kept);
			if (state.nodes >= MAX_NODES) break;
		}
		if (children.length > 0) next.children = children;
	}
	return next;
}

/** A publish-safe copy of `content`: allowlisted blocks, sanitised inline text. */
export function publishSnapshot(content) {
	if (!Array.isArray(content)) return [];
	const state = { nodes: 0 };
	const out = [];
	for (const block of content) {
		const kept = snapshotBlock(block, 1, state);
		if (kept) out.push(kept);
		if (state.nodes >= MAX_NODES) break;
	}
	return out;
}
