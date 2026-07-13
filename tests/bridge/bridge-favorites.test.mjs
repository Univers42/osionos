/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-favorites.test.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { favoritePageIdFromPath } from '../../scripts/bridge-api.mjs';

describe('favoritePageIdFromPath', () => {
	const uuid = '5a4b1c2d-2222-4222-8222-000000000002';

	it('extracts a valid uuid from /api/favorites/:id', () => {
		assert.equal(favoritePageIdFromPath(`/api/favorites/${uuid}`), uuid);
	});

	it('returns "" for the collection path (no id segment)', () => {
		assert.equal(favoritePageIdFromPath('/api/favorites'), '');
		assert.equal(favoritePageIdFromPath('/api/favorites/'), '');
	});

	it('rejects a non-uuid id (would otherwise reach the PostgREST filter)', () => {
		// requireUuid throws — the id must never be interpolated raw into a query.
		assert.throws(() => favoritePageIdFromPath('/api/favorites/not-a-uuid'));
		assert.throws(() => favoritePageIdFromPath('/api/favorites/1;DROP TABLE'));
	});
});
