/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-paging.test.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Paging primitives stay pure so the account routes can share them without pulling in a
// PostgREST client: chunking, quoted filters, signed-less cursors and keyset pages.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCursor, encodeCursor, idChunks, inFilter, keyset, pageOf } from '../../scripts/bridge-paging.mjs';

const invalidCursor = (error) => error?.status === 422 && error?.code === 'invalid_cursor';

describe('idChunks', () => {
	const idsOf = (count) => Array.from({ length: count }, (_, index) => `id-${index}`);

	it('splits 0, 1, 50, 51 and 500 ids', () => {
		assert.deepEqual(idChunks([]), []);
		assert.deepEqual(idChunks(idsOf(1)), [idsOf(1)]);
		assert.equal(idChunks(idsOf(50)).length, 1);
		const fiftyOne = idChunks(idsOf(51));
		assert.deepEqual(fiftyOne.map((chunk) => chunk.length), [50, 1]);
		assert.equal(idChunks(idsOf(500)).length, 10);
	});

	it('drops nulls, empties and duplicates keeping first-seen order', () => {
		assert.deepEqual(idChunks(['b', null, 'a', '', undefined, 'b', 'c', 'a']), [['b', 'a', 'c']]);
	});

	it('rejects an out-of-range size', () => {
		for (const size of [0, 501, 1.5]) assert.throws(() => idChunks(['a'], size), RangeError);
	});
});

describe('inFilter', () => {
	it('quotes, escapes and encodes every hostile value', () => {
		const ids = ['a,b', 'c.d', 'e(f)', 'g)h', 'i"j', 'k\\l'];
		const result = inFilter('id', ids);
		assert.equal(result, 'id=in.(%22a%2Cb%22,%22c.d%22,%22e(f)%22,%22g)h%22,%22i%5C%22j%22,%22k%5C%5Cl%22)');
		const encodedValues = result.slice('id=in.('.length, -1).split(',');
		const unquoted = encodedValues.map((value) => decodeURIComponent(value).slice(1, -1).replace(/\\(["\\])/g, '$1'));
		assert.deepEqual(unquoted, ids);
	});

	it('rejects a bad column and an empty id list', () => {
		for (const column of ['Id', 'id;drop', '', 'id)']) assert.throws(() => inFilter(column, ['a']), TypeError);
		assert.throws(() => inFilter('id', []), TypeError);
	});
});

describe('cursors', () => {
	it('round-trips strings and finite numbers', () => {
		assert.deepEqual(decodeCursor(encodeCursor(['a', 2]), 2), ['a', 2]);
	});

	it('rejects every malformed cursor', () => {
		const encoded = (text) => Buffer.from(text).toString('base64url');
		assert.throws(() => decodeCursor('A'.repeat(513), 1), invalidCursor);
		assert.throws(() => decodeCursor('not*base64url', 1), invalidCursor);
		assert.throws(() => decodeCursor('', 1), invalidCursor);
		assert.throws(() => decodeCursor(encoded('not json'), 1), invalidCursor);
		assert.throws(() => decodeCursor(encoded('{"a":1}'), 1), invalidCursor);
		assert.throws(() => decodeCursor(encodeCursor(['a']), 2), invalidCursor);
		for (const value of ['[true]', '[null]', '[{}]']) assert.throws(() => decodeCursor(encoded(value), 1), invalidCursor);
	});
});

describe('keyset', () => {
	it('orders one column without a cursor', () => {
		assert.deepEqual(keyset({ order: [['a', 'asc']] }), { query: 'order=a.asc&limit=21', take: 20 });
	});

	it('uses the direction operator of each column', () => {
		assert.equal(keyset({ order: [['a', 'desc']], cursor: ['x'], limit: 5 }).query, 'order=a.desc&limit=6&or=(a.lt.%22x%22)');
		assert.equal(keyset({ order: [['a', 'asc']], cursor: ['x'], limit: 5 }).query, 'order=a.asc&limit=6&or=(a.gt.%22x%22)');
	});

	it('builds two- and three-column filters', () => {
		const mixed = keyset({ order: [['a', 'desc'], ['b', 'asc']], cursor: ['x', 'y'] });
		assert.equal(mixed.query, 'order=a.desc,b.asc&limit=21&or=(a.lt.%22x%22,and(a.eq.%22x%22,b.gt.%22y%22))');
		const three = keyset({ order: [['a', 'desc'], ['b', 'desc'], ['c', 'desc']], cursor: ['x', 'y', 'z'] });
		assert.equal(three.query, 'order=a.desc,b.desc,c.desc&limit=21&or=(a.lt.%22x%22,and(a.eq.%22x%22,b.lt.%22y%22),and(a.eq.%22x%22,b.eq.%22y%22,c.lt.%22z%22))');
	});

	it('parses limits', () => {
		const order = [['a', 'asc']];
		assert.equal(keyset({ order, limit: 0 }).take, 1);
		assert.equal(keyset({ order }).take, 20);
		assert.equal(keyset({ order, limit: '50' }).take, 50);
		assert.equal(keyset({ order, limit: 'abc' }).take, 20);
		assert.equal(keyset({ order, limit: 1000 }).take, 100);
		assert.equal(keyset({ order, limit: 1000, maxLimit: 40 }).take, 40);
		assert.equal(keyset({ order, limit: '' }).take, 20);
		assert.equal(keyset({ order, limit: null }).take, 20);
		assert.equal(keyset({ order, limit: 5 }).query, 'order=a.asc&limit=6');
	});

	it('keeps a hostile cursor inside one or parameter', () => {
		for (const value of ['"', ')', ',', '&', '+', '2026-10-22T00:00:00+00:00']) {
			const { query } = keyset({ order: [['a', 'asc']], cursor: [value], limit: 5 });
			const params = new URLSearchParams(query);
			assert.equal(params.getAll('or').length, 1, `or parameter for ${value}`);
			assert.equal(params.getAll('order').length, 1);
			assert.equal(params.getAll('limit').length, 1);
			const quoted = `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
			assert.equal(params.get('or'), `(a.gt.${quoted})`);
		}
	});
});

describe('pageOf', () => {
	const order = [['created_at', 'desc'], ['id', 'asc']];
	const row = (createdAt, id) => ({ created_at: createdAt, id });

	it('reports no next page on exactly take rows', () => {
		const rows = [row('2026-10-22T00:00:02Z', 'a'), row('2026-10-22T00:00:01Z', 'b')];
		assert.deepEqual(pageOf(rows, order, 2), { items: rows, nextCursor: null });
	});

	it('builds the cursor from row take-1 when a next page exists', () => {
		const rows = [row('2026-10-22T00:00:03Z', 'a'), row('2026-10-22T00:00:02Z', 'b'), row('2026-10-22T00:00:01Z', 'c')];
		const { items, nextCursor } = pageOf(rows, order, 2);
		assert.deepEqual(items, rows.slice(0, 2));
		assert.deepEqual(decodeCursor(nextCursor, 2), ['2026-10-22T00:00:02Z', 'b']);
	});

	it('refuses a null order value in the cursor row', () => {
		const rows = [row('2026-10-22T00:00:03Z', 'a'), row(null, 'b'), row('2026-10-22T00:00:01Z', 'c')];
		assert.throws(() => pageOf(rows, order, 2), TypeError);
	});

	it('refuses non-cursor order value types', () => {
		for (const bad of [true, {}, ['x']]) {
			const rows = [row('2026-10-22T00:00:03Z', bad), row('2026-10-22T00:00:02Z', 'b')];
			assert.throws(() => pageOf(rows, order, 1), TypeError);
		}
	});
});
