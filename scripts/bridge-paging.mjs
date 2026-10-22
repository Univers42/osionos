/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-paging.mjs                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * List paging for the account routes: bounded `in.(…)` chunks, quoted filters, and keyset
 * cursors. The error shape is shared with bridge-pg.mjs so a cursor failure is the same
 * 422 the account routes already map.
 */

import { pgError } from './bridge-pg.mjs';

const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_CURSOR_LENGTH = 512;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_LIMIT = 100;

const has = (value) => value !== undefined && value !== null && value !== '';

// Caveat: 50 was measured with unquoted ids (bridge-api.mjs:1371-1379). `inFilter` adds 6
// bytes per id for quotes and encoding, so 50 uuids are ~2.15 KB instead of ~1.85 KB,
// leaving ~1.5 KB of Kong's 4 KB header buffer for the rest of the query string. A 50-id
// chunk (~2.1 KB) plus a 3-column cursor (~2.3 KB) must not share one request; 80 is the
// hard ceiling here, not a safe default.
export function idChunks(ids, size = 50) {
	if (!Array.isArray(ids)) throw new TypeError('idChunks expects an array of ids.');
	if (!Number.isInteger(size) || size < 1 || size > 80) throw new RangeError('chunk size must be an integer from 1 to 80.');
	const unique = [];
	const seen = new Set();
	for (const id of ids) {
		if (!has(id) || seen.has(id)) continue;
		seen.add(id);
		unique.push(id);
	}
	const chunks = [];
	for (let at = 0; at < unique.length; at += size) chunks.push(unique.slice(at, at + size));
	return chunks;
}

function quoteFilterValue(value) {
	const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return encodeURIComponent(`"${escaped}"`);
}

/** PostgREST `in` filter with quoted values, so commas and parentheses stay inside an id. */
export function inFilter(column, ids) {
	if (typeof column !== 'string' || !IDENTIFIER_PATTERN.test(column)) throw new TypeError('filter column must be a plain postgres identifier.');
	if (!Array.isArray(ids) || ids.length === 0) throw new TypeError('inFilter needs at least one id.');
	return `${column}=in.(${ids.map(quoteFilterValue).join(',')})`;
}

// Caveat: the cursor is not signed. Tampering only moves the page start; it can never
// widen the rows a caller may see, because every filter is still applied server-side.
export function encodeCursor(values) {
	return Buffer.from(JSON.stringify(values)).toString('base64url');
}

export function decodeCursor(token, arity) {
	const invalid = () => pgError(422, 'invalid_cursor');
	if (typeof token !== 'string' || token.length > MAX_CURSOR_LENGTH || !BASE64URL_PATTERN.test(token)) throw invalid();
	let values;
	try {
		values = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
	} catch {
		throw invalid();
	}
	if (!Array.isArray(values) || values.length !== arity) throw invalid();
	for (const value of values) {
		if (typeof value === 'string') {
			// A lone surrogate passes JSON but makes encodeURIComponent throw URIError later.
			if (!value.isWellFormed()) throw invalid();
			continue;
		}
		if (typeof value === 'number' && Number.isFinite(value)) continue;
		throw invalid();
	}
	return values;
}

function normalizeOrder(order) {
	if (!Array.isArray(order) || order.length < 1 || order.length > 3) throw new TypeError('keyset order must name 1 to 3 columns.');
	return order.map((entry) => {
		if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError('each keyset order entry is [column, direction].');
		const [column, direction] = entry;
		if (typeof column !== 'string' || !IDENTIFIER_PATTERN.test(column)) throw new TypeError('keyset column must be a plain postgres identifier.');
		if (direction !== 'asc' && direction !== 'desc') throw new TypeError("keyset direction must be 'asc' or 'desc'.");
		return [column, direction];
	});
}

function keysetFilter(order, cursor) {
	const terms = order.map(([column, direction], index) => {
		const operator = direction === 'desc' ? 'lt' : 'gt';
		const equalities = order.slice(0, index).map(([prefix], at) => `${prefix}.eq.${quoteFilterValue(cursor[at])}`);
		equalities.push(`${column}.${operator}.${quoteFilterValue(cursor[index])}`);
		return index === 0 ? equalities[0] : `and(${equalities.join(',')})`;
	});
	return `(${terms.join(',')})`;
}

function resolveTake(limit, maxLimit) {
	const cap = Number.isFinite(Number(maxLimit)) ? Math.max(1, Math.trunc(Number(maxLimit))) : DEFAULT_MAX_LIMIT;
	const parsed = has(limit) ? Number(limit) : NaN;
	const value = Number.isFinite(parsed) ? Math.trunc(parsed) : DEFAULT_PAGE_SIZE;
	return Math.min(Math.max(value, 1), cap);
}

/**
 * Lexicographic `or=(…)` page filter. Every order column must be NOT NULL in the table:
 * a null in the tuple makes the comparison skip the row, so the next page would drop it.
 * The last entry is the unique tie-breaker. `cursor` is the DECODED array:
 * `decodeCursor(token, order.length)`.
 */
export function keyset({ order, cursor, limit, maxLimit = DEFAULT_MAX_LIMIT } = {}) {
	const normalized = normalizeOrder(order);
	const hasCursor = has(cursor);
	if (hasCursor && (!Array.isArray(cursor) || cursor.length !== normalized.length)) {
		throw new TypeError('keyset cursor must carry one value per order column.');
	}
	const take = resolveTake(limit, maxLimit);
	const ordered = normalized.map(([column, direction]) => `${column}.${direction}`).join(',');
	let query = `order=${ordered}&limit=${take + 1}`;
	if (hasCursor) query += `&or=${keysetFilter(normalized, cursor)}`;
	return { query, take };
}

// Caveat: numbers travel through JSON, so a bigint column above 2^53 loses precision.
// Page by a uuid or timestamptz tie-breaker, never by a raw bigint id.
// Caveat: `rows` must be the raw PostgREST values. Converting `created_at` through `Date`
// truncates microseconds, so the next page silently skips rows.
export function pageOf(rows, order, take) {
	if (!Array.isArray(rows)) throw new TypeError('pageOf expects an array of rows.');
	if (!Number.isInteger(take) || take < 1) throw new TypeError('pageOf take must be a positive integer.');
	const items = rows.slice(0, take);
	if (rows.length <= take) return { items, nextCursor: null };
	const edge = rows[take - 1];
	const values = order.map(([column]) => {
		const value = edge?.[column];
		// decodeCursor would refuse any other type, turning page two into a permanent 422.
		if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
			throw new TypeError(`order column ${column} is not a cursor value.`);
		}
		return value;
	});
	return { items, nextCursor: encodeCursor(values) };
}
