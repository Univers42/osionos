/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-readme-bindings.test.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The README projection's binding filter: a bound block may only name a field of the public
 * card, and `README_BINDABLE_FIELDS` must stay in step with `CARD_COLUMNS`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_COLUMNS } from '../../scripts/bridge-account-profile.mjs';
import { README_BINDABLE_FIELDS, neutraliseBindings } from '../../scripts/bridge-readme-bindings.mjs';

const camel = (column) => column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const bound = (fieldBind, extra = {}) => ({ id: 'b', type: 'heading_1', content: '', recordRef: '$record', fieldBind, ...extra });
const EMPTY = { id: 'b', type: 'paragraph', content: '' };

describe('README_BINDABLE_FIELDS', () => {
	it('is the public card minus the identifier and the images', () => {
		const expected = CARD_COLUMNS.map(camel).filter((key) => !['userId', 'avatarUrl', 'bannerUrl'].includes(key));
		assert.deepEqual([...README_BINDABLE_FIELDS].sort(), expected.sort());
		assert.equal(README_BINDABLE_FIELDS.length, 13);
	});

	it('fails the parity check when the card gains a column nobody decided on', () => {
		const widened = [...CARD_COLUMNS, 'email'].map(camel).filter((key) => !['userId', 'avatarUrl', 'bannerUrl'].includes(key));
		assert.notDeepEqual([...README_BINDABLE_FIELDS].sort(), widened.sort());
	});
});

describe('neutraliseBindings', () => {
	it('keeps an allowlisted binding untouched', () => {
		const blocks = [bound('headline')];
		assert.deepEqual(neutraliseBindings(blocks), [bound('headline')]);
	});

	it('maps the legacy $viewedUser to $record when the key is allowed', () => {
		assert.deepEqual(neutraliseBindings([bound('bio', { recordRef: '$viewedUser' })]), [bound('bio')]);
	});

	for (const [name, block] of [
		['an owner-only key', bound('email')],
		['readmePageId', bound('readmePageId')],
		['a custom key', bound('custom:x')],
		['a prototype key', bound('constructor')],
		['a non-string key', bound(42)],
		['a 10 KB key', bound('x'.repeat(10 * 1024))],
		['a missing recordRef', { ...bound('headline'), recordRef: undefined }],
		['a foreign recordRef', bound('headline', { recordRef: '$other' })],
		['a legacy ref with a denied key', bound('role', { recordRef: '$viewedUser' })],
		['a recordRef with no fieldBind', { id: 'b', type: 'paragraph', content: '', recordRef: '$record' }],
	]) {
		it(`neutralises ${name} to an empty paragraph`, () => {
			const [out] = neutraliseBindings([block]);
			assert.deepEqual(out, EMPTY);
			assert.ok(!('recordRef' in out) && !('fieldBind' in out));
		});
	}

	it('walks children and layoutCells blocks', () => {
		const out = neutraliseBindings([{
			id: 'p', type: 'toggle', content: 'T',
			children: [bound('email'), { id: 'c', type: 'toggle', content: '', children: [bound('bio')] }],
			layoutCells: [{ id: 'l', blocks: [bound('role')] }, { id: 'm', blocks: [bound('company')] }],
		}]);
		assert.deepEqual(out[0].children[0], EMPTY);
		assert.deepEqual(out[0].children[1].children[0], bound('bio'));
		assert.deepEqual(out[0].layoutCells[0].blocks[0], EMPTY);
		assert.deepEqual(out[0].layoutCells[1].blocks[0], bound('company'));
	});

	it('returns [] for input that is not an array', () => {
		for (const bad of [null, undefined, {}, 'x', 3]) assert.deepEqual(neutraliseBindings(bad), []);
	});

	it('does not mutate its input', () => {
		const blocks = [bound('email', { children: [bound('role')] })];
		const before = JSON.stringify(blocks);
		neutraliseBindings(blocks);
		assert.equal(JSON.stringify(blocks), before);
	});

	it('stays bounded on a chain deeper than the cap and on a node count over the cap', { timeout: 5000 }, () => {
		let deep = bound('email');
		for (let i = 0; i < 100; i += 1) deep = { id: `d${i}`, type: 'toggle', content: '', children: [deep] };
		assert.ok(Array.isArray(neutraliseBindings([deep])));
		const wide = Array.from({ length: 6000 }, () => bound('email'));
		const out = neutraliseBindings(wide);
		assert.equal(out.length, 6000);
		assert.ok(out.every((block) => !('fieldBind' in block) || block.fieldBind !== 'email'), 'nodes past the cap are neutralised, not passed through');
	});

	it('drops what it cannot inspect rather than let it through past the depth cap', () => {
		let deep = bound('email');
		for (let i = 0; i < 100; i += 1) deep = { id: `d${i}`, type: 'toggle', content: '', children: [deep] };
		assert.ok(!JSON.stringify(neutraliseBindings([deep])).includes('"email"'));
	});
});
