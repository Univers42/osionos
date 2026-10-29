/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-emails-remove.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * DELETE /api/account/emails/:id: the audit comes first, only the caller's own row goes,
 * and the primary is changed, never removed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailWorld, PATH, USER_A, USER_B } from './support/email-world.mjs';
import { addVerified } from './support/email-helpers.mjs';

const remove = (world, userId, id) => world.call(userId, { method: 'DELETE', path: `${PATH}/${id}` });

describe('remove', () => {
	it('B15 audits first, then deletes the row and answers 204', async () => {
		const world = createEmailWorld();
		const row = await addVerified(world, USER_A, 'gone@example.com');
		world.events.length = 0;
		const result = await remove(world, USER_A, row.id);
		assert.deepEqual([result.status, world.table.rows.length, world.events], [204, 0, ['audit:account.email_removed', 'delete']]);
	});

	it('B15 answers 404 for another user\'s row id and leaves the row', async () => {
		const world = createEmailWorld();
		const row = await addVerified(world, USER_A, 'keep@example.com');
		const result = await remove(world, USER_B, row.id);
		assert.deepEqual([result.status, result.body.code, world.table.rows.length, world.table.audits.some((entry) => entry.event_type === 'account.email_removed')], [404, 'not_found', 1, false]);
	});

	it('B15 answers 409 primary_email for the primary id, with no database call', async () => {
		const world = createEmailWorld();
		const result = await remove(world, USER_A, `primary-${USER_A}`);
		assert.deepEqual([result.status, result.body.code, world.table.calls.length], [409, 'primary_email', 0]);
	});

	it('B15 answers 404 for a row id that is gone', async () => {
		const world = createEmailWorld();
		const result = await remove(world, USER_A, '22222222-2222-4222-8222-222222222222');
		assert.deepEqual([result.status, result.body.code], [404, 'not_found']);
	});
});
