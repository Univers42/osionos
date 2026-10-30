/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-discussions-input.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The bounds a suggestion, a reply or a reaction must meet before the bridge writes it
 * (#228 S10). Pure: no I/O. The CHECKs in groot's osionos-discussions-migration.sql
 * hold the same bounds, so a bridge bug is refused there too; these answer a 400 with
 * a reason instead of a 502. Offsets are CODE POINTS (spec C4), as the SQL counts them.
 */

export const MAX_SPAN = 2000;
export const MAX_INSERT_BYTES = 8000;
export const MAX_CONTEXT = 16;
export const MAX_OPEN_PER_BLOCK = 20;

/** The inline-text blocks a suggestion may target; the decide's allowlist (C5). */
export const SUGGESTIBLE_TYPES = new Set([
	'paragraph', 'heading_1', 'heading_2', 'heading_3', 'heading_4', 'heading_5', 'heading_6',
	'bulleted_list', 'numbered_list', 'to_do', 'toggle', 'quote', 'callout',
]);

const LEVEL_RANK = { none: 0, can_view: 1, can_comment: 2, can_edit: 3, full_access: 4 };

export function invalid(message) {
	return Object.assign(new Error(message), { status: 400 });
}

export function levelAtLeast(level, wanted) {
	return (LEVEL_RANK[level] ?? 0) >= LEVEL_RANK[wanted];
}

/** Code points in `text`, counting at most `limit + 1` so a huge string costs nothing extra. */
function codePointsUpTo(text, limit) {
	let count = 0;
	for (const _ of text) {
		count += 1;
		if (count > limit) break;
	}
	return count;
}

function contextOf(value, field) {
	if (value === undefined || value === null) return '';
	if (typeof value !== 'string' || codePointsUpTo(value, MAX_CONTEXT) > MAX_CONTEXT) {
		throw invalid(`anchor.${field} must be a string of at most ${MAX_CONTEXT} code points.`);
	}
	return value;
}

/** A well-formed anchor, normalised to its five fields, or a 400. */
export function parseAnchor(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalid('anchor must be an object.');
	const { start, end, quote } = raw;
	if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end) {
		throw invalid('anchor.start and anchor.end must be integers with 0 <= start <= end.');
	}
	if (end - start > MAX_SPAN) throw invalid(`anchor spans more than ${MAX_SPAN} code points.`);
	if (typeof quote !== 'string' || codePointsUpTo(quote, MAX_SPAN) !== end - start) {
		throw invalid('anchor.quote must be the end - start code points it names.');
	}
	const prefix = contextOf(raw.prefix, 'prefix');
	const suffix = contextOf(raw.suffix, 'suffix');
	// C2: an offset alone is not a place; the decide would answer stale anyway.
	if (!quote && !prefix && !suffix) throw invalid('an insertion needs the text around it (prefix or suffix).');
	return { start, end, quote, prefix, suffix };
}

/** `{insert}`, at most MAX_INSERT_BYTES of UTF-8, or a 400. */
export function parseSuggestion(raw) {
	if (!raw || typeof raw !== 'object' || typeof raw.insert !== 'string') throw invalid('suggestion.insert must be a string.');
	if (Buffer.byteLength(raw.insert, 'utf8') > MAX_INSERT_BYTES) throw invalid(`suggestion.insert is over ${MAX_INSERT_BYTES} bytes.`);
	return { insert: raw.insert };
}

/** The emoji segment of a reaction path: 1–16 code points, no space or control. */
export function parseEmoji(segment) {
	let emoji;
	try {
		emoji = decodeURIComponent(segment);
	} catch {
		throw invalid('Malformed emoji.');
	}
	const length = codePointsUpTo(emoji, 16);
	if (length < 1 || length > 16 || /[\s\p{Cc}]/u.test(emoji)) throw invalid('A reaction is 1 to 16 characters.');
	return emoji;
}

/**
 * The block `blockId` in page content, walking `children` and `layoutCells[].blocks`
 * (C5, the same walk as osionos_block_path); null when absent. Iterative: a crafted
 * deep tree cannot overflow the stack.
 */
export function findBlock(content, blockId) {
	const pending = Array.isArray(content) ? [...content] : [];
	while (pending.length > 0) {
		const block = pending.pop();
		if (!block || typeof block !== 'object') continue;
		if (block.id === blockId) return block;
		if (Array.isArray(block.children)) pending.push(...block.children);
		if (Array.isArray(block.layoutCells)) {
			for (const cell of block.layoutCells) if (Array.isArray(cell?.blocks)) pending.push(...cell.blocks);
		}
	}
	return null;
}
