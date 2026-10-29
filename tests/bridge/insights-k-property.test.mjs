/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   insights-k-property.test.mjs                       +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Property: whatever filter and window an admin asks for, no answer holds a cell of 1 to 4
 * people, and widening a filter can only add cells of 5 or more.
 *
 * Caveat: a finite grid (4 filter shapes x 3 windows over a fixed fixture), not a generator;
 * it proves the route never lets a small cell through on these shapes, not on every possible one.
 * The fixture is returned whole by the fake store, so it also proves the route's own second
 * k filter, which is the one that stands if a small cell ever reached the table.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cell, insightsWorld } from './support/insights-world.mjs';

const EVENTS = ['login', 'search', 'export'];
const SURFACES = ['settings', 'search', 'editor'];
const USERS = [1, 4, 5, 6];
const FIXTURE = EVENTS.flatMap((event, e) => SURFACES.flatMap((surface, s) => USERS.map((users, u) => cell(1 + ((e + s + u) % 6), event, surface, users * 3, users))));

const FILTERS = [
	{},
	...EVENTS.map((event) => ({ event })),
	...SURFACES.map((surface) => ({ surface })),
	...EVENTS.flatMap((event) => SURFACES.map((surface) => ({ event, surface }))),
];
const queryOf = (days, filter) => `?days=${days}${Object.entries(filter).map(([key, value]) => `&${key}=${value}`).join('')}`;
const keyOf = (c) => `${c.day}|${c.event}|${c.surface}|${c.users}`;
const isSubset = (small, large) => Object.entries(small).every(([key, value]) => large[key] === value);

describe('the k >= 5 property', () => {
	for (const days of [7, 30, 90]) {
		it(`holds for every filter shape over ${days} days`, async (t) => {
			const { call } = await insightsWorld(t, { cells: FIXTURE });
			const answers = [];
			for (const filter of FILTERS) {
				const { status, body } = await call(queryOf(days, filter));
				assert.equal(status, 200);
				for (const shown of body.cells) assert.ok(shown.users >= 5, `${JSON.stringify(filter)} showed ${shown.users}`);
				answers.push({ filter, keys: new Set(body.cells.map(keyOf)) });
			}
			assert.ok(answers[0].keys.size > 0);
			for (const small of answers) for (const large of answers) {
				if (!isSubset(large.filter, small.filter)) continue;
				for (const key of small.keys) if (!large.keys.has(key)) assert.fail(`${key} is in a narrower answer but not the wider one`);
			}
		});
	}
});
