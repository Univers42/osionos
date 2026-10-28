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
