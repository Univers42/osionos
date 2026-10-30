/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-text.mjs                                  +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 16:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 16:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The TEXT of a page — its JSONB block tree flattened to plain text.
 *
 * It lives here, apart from bridge-api.mjs, because TWO modules need it and
 * one of them is imported BY bridge-api.mjs: bridge-public.mjs (the publish
 * gate) and bridge-api.mjs (the marketplace gate) both read a page's words
 * before the page is published. A module that imports nothing cannot close an
 * import cycle, so this one imports nothing at all.
 */

/** Flatten a page's JSONB block tree to plain text (snippet source). */
export function pageContentText(content) {
	const parts = [];
	const push = (text) => {
		if (typeof text === 'string' && text !== '') parts.push(text);
	};
	const walk = (blocks) => {
		if (!Array.isArray(blocks)) return;
		for (const block of blocks) {
			if (!block) continue;
			push(block.content);
			if (Array.isArray(block.children)) walk(block.children);
			// A layout's words live in its cells: the label, the cell's own text, its blocks.
			for (const cell of Array.isArray(block.layoutCells) ? block.layoutCells : []) {
				push(cell?.label);
				push(cell?.content);
				walk(cell?.blocks);
			}
		}
	};
	walk(content);
	return parts.join(' ');
}

/**
 * The words a page PUBLISHES: its title, a newline, and its text.
 *
 * The cut at 20 000 characters is the rule the L0 rules are built for: a
 * moderation check reads a bounded text, and a page longer than that is
 * checked on its head (a blocklist term in the first 20 000 characters still
 * trips it).
 */
export function pagePublishText(row, limit = 20000) {
	const title = String(row?.title ?? '');
	const text = pageContentText(row?.content);
	return `${title}\n${text}`.slice(0, limit);
}
