/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-search.test.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pageContentText, pageSnippet, pageTitleScore } from '../../scripts/bridge-api.mjs';

describe('pageContentText', () => {
	it('flattens nested block content into a single string', () => {
		const content = [
			{ type: 'heading_1', content: 'VAPID keys' },
			{ type: 'paragraph', content: 'generate a P-256 pair', children: [
				{ type: 'to_do', content: 'wire the service worker' },
			] },
			{ type: 'divider' }, // no content — skipped
		];
		const text = pageContentText(content);
		assert.equal(text, 'VAPID keys generate a P-256 pair wire the service worker');
	});

	it('is safe on non-array / empty content', () => {
		assert.equal(pageContentText(null), '');
		assert.equal(pageContentText({}), '');
		assert.equal(pageContentText([]), '');
	});
});

describe('pageSnippet', () => {
	it('windows ~80 chars around the first query token with an ellipsis when offset', () => {
		const text = 'a'.repeat(60) + ' needle in a long haystack of words after the match position';
		const snippet = pageSnippet(text, 'needle push');
		assert.ok(snippet.startsWith('…'), 'leading ellipsis when the match is not at the start');
		assert.ok(snippet.toLowerCase().includes('needle'), 'includes the matched token');
		assert.ok(snippet.length <= 81, `snippet stays bounded (got ${snippet.length})`);
	});

	it('falls back to the head of the text when the token is absent', () => {
		const snippet = pageSnippet('short body with no match', 'zzz');
		assert.equal(snippet, 'short body with no match');
	});

	it('is safe on empty text', () => {
		assert.equal(pageSnippet('', 'x'), '');
		assert.equal(pageSnippet(null, 'x'), '');
	});
});

describe('pageTitleScore', () => {
	it('ranks prefix > substring > none', () => {
		assert.equal(pageTitleScore({ title: 'Design notes' }, 'design'), 2);
		assert.equal(pageTitleScore({ title: 'My design notes' }, 'design'), 1);
		assert.equal(pageTitleScore({ title: 'Unrelated' }, 'design'), 0);
	});
});
