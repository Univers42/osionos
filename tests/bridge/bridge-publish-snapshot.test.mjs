/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-publish-snapshot.test.mjs                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The published snapshot is the only thing an anonymous reader sees: no other page's
// title or id, no foreign block types, bounded depth and node count, and formatting marks
// unchanged for the blocks that legitimately survive.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { publishSnapshot } from '../../scripts/bridge-publish-snapshot.mjs';

const SECRET_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('publishSnapshot', () => {
	it('removes a mention of a private page: neither its title nor its uuid survives', () => {
		const content = [{
			id: 'p1',
			type: 'paragraph',
			content: `before [[page:${SECRET_ID}]] and [Secret Plan](page://${SECRET_ID}) after`,
		}];
		const json = JSON.stringify(publishSnapshot(content));
		assert.equal(json.includes('Secret Plan'), false);
		assert.equal(json.includes(SECRET_ID), false);
		assert.match(publishSnapshot(content)[0].content, /before\s+and\s+after/);
	});

	it('drops child-page, database, embed, media and bookmark blocks entirely', () => {
		const blocks = [
			{ id: 'a', type: 'child_page', content: 'Child', children: [{ id: 'a1', type: 'paragraph', content: 'nested' }] },
			{ id: 'b', type: 'database_inline', databaseId: SECRET_ID },
			{ id: 'c', type: 'database_full_page', databaseId: SECRET_ID },
			{ id: 'd', type: 'embed', content: `https://app.example/page://${SECRET_ID}`, embed: { title: 'Secret Plan' } },
			{ id: 'e', type: 'image', asset: 'asset-1', mediaAlt: 'Secret Plan' },
			{ id: 'f', type: 'bookmark', content: 'https://example.com' },
		];
		assert.deepEqual(publishSnapshot(blocks), []);
	});

	it('drops an unknown block type', () => {
		assert.deepEqual(publishSnapshot([{ id: 'x', type: 'future_block', content: 'text' }]), []);
	});

	it('drops every href but keeps the visible text of an external link', () => {
		const snapshot = publishSnapshot([{ id: 'p', type: 'paragraph', content: 'see [Example](https://example.com/a) now' }]);
		assert.equal(snapshot[0].content, 'see Example now');
		assert.equal(JSON.stringify(snapshot).includes('https://example.com'), false);
	});

	it('stops at 20,000 nodes', () => {
		const blocks = Array.from({ length: 20_001 }, (_, index) => ({ id: `b${index}`, type: 'paragraph', content: 'x' }));
		assert.equal(publishSnapshot(blocks).length, 20_000);
	});

	it('keeps text and formatting marks byte-equal in heading, paragraph and code blocks', () => {
		const content = [{
			id: 'h1',
			type: 'heading_2',
			content: '[b]bold[/b] [i]italic[/i] [code]inline[/code] [mark]marked[/mark]',
		}, {
			id: 'p1',
			type: 'paragraph',
			content: 'plain & text — with [u]underline[/u]',
		}, {
			id: 'c1',
			type: 'code',
			content: 'const x = 1 < 2 && "ok";',
			language: 'js',
			lineNumbers: true,
		}];
		assert.deepEqual(publishSnapshot(content), content);
	});

	it('returns [] for malformed input instead of throwing', () => {
		for (const value of [null, undefined, {}, 'blocks', 42]) {
			assert.deepEqual(publishSnapshot(value), []);
		}
	});

	it('cuts a 40-deep chain at depth 32 without throwing', () => {
		let block = { id: 'b40', type: 'paragraph', content: '40' };
		for (let level = 39; level >= 1; level -= 1) {
			block = { id: `b${level}`, type: 'paragraph', content: String(level), children: [block] };
		}
		const snapshot = publishSnapshot([block]);
		let depth = 0;
		let node = snapshot[0];
		while (node) {
			depth += 1;
			node = node.children?.[0];
		}
		assert.equal(depth, 32);
	});
});

// #61: a formula-gated cell always hid on /p/:token — the public page has no
// properties to evaluate it with. The owner's view decides at publish time:
// the snapshot carries what it showed, and no formula at all.
describe('publishSnapshot: layouts and formula-gated content', () => {
	const cell = (id, extra = {}) => ({ id, colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 1, blocks: [], ...extra });
	const layout = (cells, extra = {}) => ({ id: 'L', type: 'layout', content: '', layoutCells: cells, ...extra });

	it('keeps a layout: its grid, its cells, and their blocks sanitised like any other', () => {
		const content = [layout([cell('c1', {
			label: 'About',
			content: 'side note',
			tint: 'var(--osio-bg-surface)',
			textColor: 'var(--osio-fg-default)',
			offset: { x: 4, y: -2 },
			sizing: 'auto-height',
			padding: 'compact',
			fontSize: 'large',
			wrap: false,
			section: 'about',
			measuredHeight: 300,
			blocks: [
				{ id: 'p', type: 'paragraph', content: `hello [[page:${SECRET_ID}]]` },
				{ id: 'e', type: 'embed', content: 'https://example.com' },
			],
		})], { layoutConfig: { columns: 12, rowHeight: 96, gap: 16, columnGap: 8, rowGap: 12, rows: 4, preview: true } })];

		assert.deepEqual(publishSnapshot(content), [{
			id: 'L',
			type: 'layout',
			content: '',
			layoutConfig: { columns: 12, rowHeight: 96, gap: 16, columnGap: 8, rowGap: 12, rows: 4 },
			layoutCells: [{
				id: 'c1', colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 1,
				label: 'About',
				content: 'side note',
				tint: 'var(--osio-bg-surface)',
				textColor: 'var(--osio-fg-default)',
				offset: { x: 4, y: -2 },
				sizing: 'auto-height',
				padding: 'compact',
				fontSize: 'large',
				wrap: false,
				blocks: [{ id: 'p', type: 'paragraph', content: 'hello ' }],
			}],
		}]);
	});

	it('publishes a gated cell only when the owner\'s view showed it, and never its formula', () => {
		const content = [layout([
			cell('shown', { visibilityFormula: 'prop("Status") == "Done"', content: 'visible to the owner' }),
			cell('hidden', { visibilityFormula: 'prop("Status") == "Draft"', content: 'hidden from the owner' }),
			cell('plain', { content: 'never gated' }),
		])];
		const snapshot = publishSnapshot(content, { shown: new Set(['shown']) });

		assert.deepEqual(snapshot[0].layoutCells.map((kept) => kept.id), ['shown', 'plain']);
		assert.equal(JSON.stringify(snapshot).includes('prop('), false);
	});

	it('publishes a gated block only when the owner\'s view showed it, at any depth, and never its formula', () => {
		const content = [
			{ id: 'b1', type: 'paragraph', content: 'shown', visibleWhen: 'prop("Public")' },
			{ id: 'b2', type: 'paragraph', content: 'hidden', visibleWhen: 'prop("Draft")' },
			{ id: 't', type: 'toggle', content: 'outer', children: [
				{ id: 'b3', type: 'paragraph', content: 'nested hidden', visibleWhen: 'false' },
				{ id: 'b4', type: 'paragraph', content: 'nested plain' },
			] },
			layout([cell('c', { blocks: [{ id: 'b5', type: 'paragraph', content: 'in a cell', visibleWhen: 'prop("Draft")' }] })]),
		];
		const snapshot = publishSnapshot(content, { shown: new Set(['b1']) });

		assert.deepEqual(snapshot.map((block) => block.id), ['b1', 't', 'L']);
		assert.deepEqual(snapshot[1].children.map((block) => block.id), ['b4']);
		assert.deepEqual(snapshot[2].layoutCells[0].blocks, []);
		assert.equal(JSON.stringify(snapshot).includes('prop('), false);
	});

	it('publishes no gated content when the publish carried no decision', () => {
		const content = [
			{ id: 'b', type: 'paragraph', content: 'gated', visibleWhen: 'true' },
			layout([cell('c', { visibilityFormula: 'true' }), cell('d')]),
		];
		const snapshot = publishSnapshot(content);

		assert.deepEqual(snapshot.map((block) => block.id), ['L']);
		assert.deepEqual(snapshot[0].layoutCells.map((kept) => kept.id), ['d']);
	});

	it('drops a cell colour that could load something, and keeps one that cannot', () => {
		const mixed = 'color-mix(in srgb, #2563eb 8%, var(--osio-bg-surface))';
		const [kept] = publishSnapshot([layout([cell('c', {
			backgroundColor: 'url(https://tracker.example/p.png)',
			tint: 'image-set("https://tracker.example/p.png" 1x)',
			textColor: mixed,
		})])])[0].layoutCells;

		assert.equal(kept.textColor, mixed);
		assert.equal('backgroundColor' in kept, false);
		assert.equal('tint' in kept, false);
	});

	it('drops a layout cell without a usable grid position', () => {
		const snapshot = publishSnapshot([layout([cell('ok'), { id: 'bad', colStart: 'x', blocks: [] }, null])]);
		assert.deepEqual(snapshot[0].layoutCells.map((kept) => kept.id), ['ok']);
	});
});
