/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-mentions.test.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseMentions } from '../../scripts/bridge-social-core.mjs';

describe('parseMentions', () => {
	it('extracts plain and dotted handles', () => {
		assert.deepEqual(parseMentions('hey @director and @ethan.reed!'), ['director', 'ethan.reed']);
		assert.deepEqual(parseMentions('@maya.kowalski'), ['maya.kowalski']);
	});

	it('skips email addresses (word char before @)', () => {
		assert.deepEqual(parseMentions('mail me at user@example.com please'), []);
	});

	it('lowercases and de-duplicates', () => {
		assert.deepEqual(parseMentions('@Director hi @director'), ['director']);
	});

	it('caps at 20 handles', () => {
		const text = Array.from({ length: 30 }, (_, i) => `@user_${i}`).join(' ');
		assert.equal(parseMentions(text).length, 20);
	});

	it('returns [] for no mentions / empty / nullish', () => {
		assert.deepEqual(parseMentions('nothing to see here'), []);
		assert.deepEqual(parseMentions(''), []);
		assert.deepEqual(parseMentions(null), []);
		assert.deepEqual(parseMentions(undefined), []);
	});

	it('does not match a bare @ or @@', () => {
		assert.deepEqual(parseMentions('an @ symbol and @@weird'), []);
	});
});
