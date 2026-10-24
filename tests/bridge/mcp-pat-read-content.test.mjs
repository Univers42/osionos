/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mcp-pat-read-content.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * osionos_read_page shows page.content, so a PAT with pages:read must receive `content`
 * on GET /api/pages/:id. This pins the real read mask: a classic read token and a
 * fine-grained token that names `content` get it; one that does not name it does not.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { send } from './support/bridge-harness.mjs';
import { bearer, fineGrained, PAGE, patRow, startPatWorld } from './support/pat-world.mjs';

const BODY = [{ id: 'b1', type: 'paragraph', content: 'the body' }];

async function readPage(t, spec) {
	const { secret, row } = patRow(spec);
	const world = await startPatWorld(t, { tokens: [row] });
	return send(world.base, `/api/pages/${PAGE}`, bearer(secret));
}

describe('GET /api/pages/:id for a PAT carries the content only when the mask names it', () => {
	it('gives a classic pages:read token the content', async (t) => {
		const answer = await readPage(t, { scopes: ['pages:read'] });
		assert.equal(answer.status, 200);
		assert.deepEqual(answer.body.content, BODY);
	});

	it('gives a fine-grained token that names content the content', async (t) => {
		const answer = await readPage(t, fineGrained(['title', 'content']));
		assert.deepEqual(answer.body.content, BODY);
	});

	it('withholds the content from a fine-grained token that does not name it', async (t) => {
		const answer = await readPage(t, fineGrained(['title']));
		assert.equal(answer.status, 200);
		assert.equal(Object.hasOwn(answer.body, 'content'), false);
	});
});
