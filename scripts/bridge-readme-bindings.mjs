/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-readme-bindings.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Defence in depth for the README projection: a hostile owner can PATCH their README page with
 * any `recordRef`/`fieldBind`, so the card never carries a binding that names a field outside
 * the public card. The client resolves bindings against a public-only record as well; this is
 * the layer that holds when a stale or modified client does not.
 *
 * Caveat: it walks `children` and `layoutCells[].blocks`, the only child-holding fields of
 * `Block`/`LayoutCell` (src/entities/block/model/types.ts) when written; a container added
 * later is not walked, so a binding inside it survives until it is listed here. Past the
 * depth/node caps a block is replaced by an empty paragraph, which loses content but never
 * lets an unchecked binding through.
 */

// Listed here, not derived from CARD_COLUMNS: bridge-account-profile imports this module, and a
// cycle would read the card list before it exists. tests/bridge/bridge-readme-bindings.test.mjs
// fails when the two drift apart.
export const README_BINDABLE_FIELDS = Object.freeze([
	'displayName', 'username', 'pronouns', 'headline', 'bio', 'location', 'company', 'website',
	'links', 'timezone', 'orcid', 'patreon', 'profession',
]);

const BINDABLE = new Set(README_BINDABLE_FIELDS);
const RECORD_REFS = new Set(['$record', '$viewedUser']);
const MAX_DEPTH = 12;
const MAX_NODES = 5000;

const isBlock = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasBinding = (block) => 'recordRef' in block || 'fieldBind' in block;
const isAllowed = (block) => RECORD_REFS.has(block.recordRef) && typeof block.fieldBind === 'string' && BINDABLE.has(block.fieldBind);

function emptyParagraph(block) {
	return { id: block.id, type: 'paragraph', content: '' };
}

function cleanBlock(block, depth, budget) {
	if (depth > MAX_DEPTH || budget.left <= 0) return emptyParagraph(block);
	budget.left -= 1;
	const out = { ...block };
	if (hasBinding(out)) {
		if (isAllowed(out)) out.recordRef = '$record';
		else {
			delete out.recordRef;
			delete out.fieldBind;
			out.type = 'paragraph';
			out.content = '';
		}
	}
	if (Array.isArray(out.children)) out.children = cleanList(out.children, depth + 1, budget);
	if (Array.isArray(out.layoutCells)) {
		out.layoutCells = out.layoutCells.map((cell) => (isBlock(cell) && Array.isArray(cell.blocks)
			? { ...cell, blocks: cleanList(cell.blocks, depth + 1, budget) } : cell));
	}
	return out;
}

function cleanList(blocks, depth, budget) {
	return blocks.filter(isBlock).map((block) => cleanBlock(block, depth, budget));
}

/** A copy of `blocks` in which every binding names a public-card field; `[]` for non-arrays. */
export function neutraliseBindings(blocks) {
	return Array.isArray(blocks) ? cleanList(blocks, 0, { left: MAX_NODES }) : [];
}
