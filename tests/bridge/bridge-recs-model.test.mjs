/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-recs-model.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The recommender's maths in the bridge: the fold-in of a user, the
 * explanation of a recommendation and the diversity of the slate. The
 * signature of the slate is bridge-recs-slate.test.mjs.
 *
 * What the model must hold:
 *   * the fold-in agrees with the numpy reference (services/osionos-ml) — the
 *     fixture is the contract, and the two must not drift apart;
 *   * the matrix is SOLVED, never inverted: a matrix that is not positive
 *     definite is refused with a throw, never with a NaN;
 *   * the explanation names the item that really contributes;
 *   * the diversity pushes a near-duplicate below a distinct item, and keeps
 *     the authors apart.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	confidences,
	explain,
	foldIn,
	itemWeights,
	mmr,
} from '../../scripts/bridge-recs-model.mjs';

const FIXTURE = JSON.parse(readFileSync(
	new URL('../../services/osionos-ml/tests/fixtures/foldin-parity.json', import.meta.url),
	'utf8',
));

/** The vector of an item of the fixture. */
function vectorOf(itemId) {
	const item = FIXTURE.items.find((entry) => entry.item_id === itemId);
	assert.ok(item, `the fixture holds ${itemId}`);
	return item.vector;
}

describe('the fold-in', () => {
	it('agrees with the numpy reference on every user of the fixture', () => {
		for (const user of FIXTURE.users) {
			const recent = user.items.map((entry) => ({
				item_kind: 'page',
				item_id: entry.item_id,
				events: entry.events,
				vector: vectorOf(entry.item_id),
			}));
			const items = itemWeights(recent, FIXTURE.event_weights);
			const folded = foldIn(
				FIXTURE.item_gram,
				FIXTURE.factors,
				items,
				FIXTURE.regularization,
				FIXTURE.alpha,
			);
			assert.ok(folded, `${user.user_id} folds in`);
			const expected = FIXTURE.expected[user.user_id];
			const worst = Math.max(...expected.map((value, index) => Math.abs(folded.vector[index] - value)));
			assert.ok(worst <= 1e-6, `${user.user_id} differs by ${worst}`);
		}
	});

	it('weights an item with the champion\'s own weights', () => {
		const items = itemWeights(
			[{ item_kind: 'page', item_id: 'a', events: { like: 2, share: 1 }, vector: [1, 0] }],
			FIXTURE.event_weights,
		);
		// like = 1 (twice) and share = 3 (once).
		assert.equal(items.length, 1);
		assert.equal(items[0].weight, 5);
	});

	it('leaves out an item with no weight or no vector', () => {
		const items = itemWeights(
			[
				{ item_kind: 'page', item_id: 'a', events: { like: 1 }, vector: null },
				{ item_kind: 'page', item_id: 'b', events: { not_interested: 3 }, vector: [1, 0] },
				{ item_kind: 'page', item_id: 'c', events: { like: 1 }, vector: [1, 0] },
			],
			FIXTURE.event_weights,
		);
		assert.deepEqual(items.map((item) => item.itemId), ['c']);
	});

	it('is nothing without items', () => {
		assert.equal(foldIn(FIXTURE.item_gram, FIXTURE.factors, [], FIXTURE.regularization, FIXTURE.alpha), null);
	});

	it('refuses a matrix that is not positive definite, and never answers a NaN', () => {
		const notSpd = [1, 0, 0, -1];
		const items = [{ itemId: 'a', vector: [1, 0], weight: 1 }];
		assert.throws(
			() => foldIn(notSpd, 2, items, 0.05, 40),
			(error) => error instanceof Error && !String(error.message).includes('NaN'),
		);
	});
});

describe('the explanation', () => {
	const gram = [2, 0.5, 0.5, 2];
	const items = confidences([
		{ itemId: 'liked', vector: [1, 0], weight: 2 },
		{ itemId: 'commented', vector: [0, 1], weight: 2 },
	], 40);

	it('names the item that contributes the most', () => {
		const folded = foldIn(gram, 2, items, 0.05, 40);
		assert.equal(explain(folded.chol, 2, [1, 0.2], items), 'liked');
		assert.equal(explain(folded.chol, 2, [0, 1], items), 'commented');
	});

	it('names nothing when nothing contributes', () => {
		const folded = foldIn(gram, 2, items, 0.05, 40);
		assert.equal(explain(folded.chol, 2, [0, 0], items), null);
		assert.equal(explain(folded.chol, 2, [1, 0.2], []), null);
	});
});

describe('the diversity', () => {
	it('pushes a near-duplicate below a distinct, less relevant item', () => {
		const candidates = [
			{ id: 'a', ownerId: 'u1', score: 1.0, vector: [1, 0] },
			{ id: 'b', ownerId: 'u2', score: 0.3, vector: [1, 0] },
			{ id: 'c', ownerId: 'u3', score: 0.0, vector: [0, 1] },
		];
		const chosen = mmr(candidates, { limit: 3 });
		assert.deepEqual(chosen.map((candidate) => candidate.id), ['a', 'c', 'b']);
	});

	it('keeps at most two pages of one author', () => {
		const candidates = [
			{ id: 'p1', ownerId: 'u1', score: 1.0, vector: [1, 0] },
			{ id: 'p2', ownerId: 'u1', score: 0.9, vector: [0, 1] },
			{ id: 'p3', ownerId: 'u1', score: 0.8, vector: [0, -1] },
			{ id: 'q1', ownerId: 'u2', score: 0.7, vector: [1, 1] },
		];
		const chosen = mmr(candidates, { limit: 4, authorCap: 2 });
		assert.equal(chosen.filter((candidate) => candidate.ownerId === 'u1').length, 2);
		assert.equal(chosen.length, 3);
	});

	it('keeps the lower index when two candidates tie', () => {
		const candidates = [
			{ id: 'x', ownerId: 'u1', score: 1, vector: [1, 0] },
			{ id: 'y', ownerId: 'u2', score: 1, vector: [0, 1] },
		];
		assert.deepEqual(mmr(candidates, { limit: 2 }).map((candidate) => candidate.id), ['x', 'y']);
	});
});
