/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-library-views-shape.test.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 19:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 19:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// C905/C906/C908: the closed shape a stored Library view may have, tested alone.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LibraryViewsShapeError, MAX_VIEWS, parseLibraryViews, readStoredLibraryViews } from '../../scripts/bridge-library-views-shape.mjs';

function libraryView(id = 'v-library-all', extra = {}) {
	return {
		id, databaseId: 'workspace-library', name: 'All', type: 'table',
		filters: [{ id: 'f1', propertyId: 'library-scope', operator: 'equals', value: 'Workspace' }],
		filterConjunction: 'and', sorts: [{ id: 's1', propertyId: 'title', direction: 'asc' }],
		visibleProperties: ['title', 'library-scope'], settings: { showRowNumbers: true, locked: true }, ...extra,
	};
}

const refused = (views) => assert.throws(() => parseLibraryViews(views), LibraryViewsShapeError);
const one = (view) => ({ [view.id]: view });
const deep = (levels) => (levels === 0 ? 'x' : { a: deep(levels - 1) });

describe('parseLibraryViews', () => {
	it('accepts a kit view and returns an equal copy, not the same object', () => {
		const views = one(libraryView());
		const parsed = parseLibraryViews(views);
		assert.deepEqual(parsed, views);
		assert.notEqual(parsed, views);
	});

	it('refuses every shape outside the allowlist', () => {
		const cases = {
			'not an object': [],
			'too many views': Object.fromEntries(Array.from({ length: MAX_VIEWS + 1 }, (_, index) => [`v-${index}`, libraryView(`v-${index}`)])),
			'bad id': { 'x-1': libraryView('x-1') },
			'id differs from key': { 'v-a': libraryView('v-b') },
			'another database': one(libraryView('v-a', { databaseId: 'other' })),
			'unknown view key': one(libraryView('v-a', { onLoad: 'x' })),
			'automations in settings': one(libraryView('v-a', { settings: { automations: [] } })),
			'dashboard type': one(libraryView('v-a', { type: 'dashboard' })),
			'long name': one(libraryView('v-a', { name: 'n'.repeat(121) })),
			'bad operator': one(libraryView('v-a', { filters: [{ id: 'f', propertyId: 'p', operator: 'eval', value: 1 }] })),
			'unknown filter key': one(libraryView('v-a', { filters: [{ id: 'f', propertyId: 'p', operator: 'equals', script: 'x' }] })),
			'bad direction': one(libraryView('v-a', { sorts: [{ id: 's', propertyId: 'p', direction: 'up' }] })),
			'bad conjunction': one(libraryView('v-a', { filterConjunction: 'xor' })),
			'javascript url value': one(libraryView('v-a', { filters: [{ id: 'f', propertyId: 'p', operator: 'equals', value: 'javascript:alert(1)' }] })),
			'https url in settings': one(libraryView('v-a', { settings: { icon: 'https://evil.example/x.png' } })),
			'protocol-relative url': one(libraryView('v-a', { settings: { icon: '//evil.example/x.png' } })),
			'data url': one(libraryView('v-a', { settings: { icon: ' data:image/svg+xml,<svg/>' } })),
			'constructor key': one(libraryView('v-a', { settings: { columnWidths: { constructor: 1 } } })),
			'prototype key': one(libraryView('v-a', { settings: { columnWidths: { prototype: 1 } } })),
			'too deep': one(libraryView('v-a', { settings: { columnWidths: deep(6) } })),
			'non-finite number': one(libraryView('v-a', { settings: { loadLimit: Infinity } })),
			'too large': Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`v-${index}`, libraryView(`v-${index}`, { settings: { columnOrder: Array.from({ length: 30 }, () => 'p'.repeat(60)) } })])),
		};
		for (const [label, views] of Object.entries(cases)) {
			assert.throws(() => parseLibraryViews(views), LibraryViewsShapeError, label);
		}
	});

	it('refuses an own __proto__ key at any depth (JSON.parse makes it own)', () => {
		refused(JSON.parse('{"__proto__": {}}'));
		refused(one(libraryView('v-a', { settings: JSON.parse('{"columnWidths": {"__proto__": {"x": 1}}}') })));
	});

	it('names the failing path', () => {
		try {
			parseLibraryViews(one(libraryView('v-a', { databaseId: 'other' })));
			assert.fail('expected a refusal');
		} catch (error) {
			assert.equal(error.path, 'views.v-a.databaseId');
		}
	});
});

describe('readStoredLibraryViews (C908)', () => {
	it('keeps the views that pass and drops the rest', () => {
		const good = libraryView('v-good');
		const stored = { 'v-good': good, 'v-bad': libraryView('v-bad', { settings: { icon: 'javascript:x' } }), constructor: libraryView('constructor') };
		assert.deepEqual(readStoredLibraryViews(stored), { 'v-good': good });
	});

	it('answers {} for anything that is not a record', () => {
		for (const value of [undefined, null, 'x', [], 3]) assert.deepEqual(readStoredLibraryViews(value), {});
	});

	it('stops at the view and byte caps', () => {
		const many = Object.fromEntries(Array.from({ length: MAX_VIEWS + 5 }, (_, index) => [`v-${index}`, libraryView(`v-${index}`)]));
		assert.equal(Object.keys(readStoredLibraryViews(many)).length, MAX_VIEWS);
		const heavy = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`v-${index}`, libraryView(`v-${index}`, { settings: { columnOrder: Array.from({ length: 30 }, () => 'p'.repeat(60)) } })]));
		assert.ok(Object.keys(readStoredLibraryViews(heavy)).length < 40);
	});
});
