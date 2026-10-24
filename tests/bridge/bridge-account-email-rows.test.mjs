/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-email-rows.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The secondary-email table primitive in isolation: every read and write is scoped to the
 * caller's user id, the sweep takes only that user's stale pending rows, and the address
 * grammar refuses what would let a header be injected into the mail grobase builds.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailRows, hmacOf, normaliseAddress, PENDING_TTL_MS } from '../../scripts/bridge-account-email-rows.mjs';
import { createEmailTable, goodEnv, USER_A, USER_B } from './support/email-world.mjs';

const NOW = Date.parse('2026-10-24T10:00:00Z');

function setup() {
	const events = [];
	const table = createEmailTable({ events, now: () => NOW });
	return { table, rows: createEmailRows({ pg: table.pg, env: goodEnv() }), env: goodEnv() };
}

describe('scoping by user id', () => {
	it('M12 M13 get, own, remove and markVerified of another user\'s row touch nothing', async () => {
		const { table, rows, env } = setup();
		const row = await rows.insert(USER_A, 'a1@example.com');
		assert.equal(await rows.get(USER_B, row.id), null);
		assert.equal(await rows.own(USER_B, hmacOf('a1@example.com', env)), null);
		assert.equal(await rows.remove(USER_B, row.id), false);
		assert.equal(await rows.markVerified(USER_B, row.id, '2026-10-24T10:00:00Z'), null);
		assert.deepEqual([table.rows.length, table.rows[0].verified_at], [1, null]);
		assert.ok(await rows.markVerified(USER_A, row.id, '2026-10-24T10:00:00Z'));
		assert.equal(await rows.remove(USER_A, row.id), true);
	});

	it('sweep removes only the caller\'s pending rows older than the ttl', async () => {
		const { table, rows } = setup();
		const stale = new Date(NOW - PENDING_TTL_MS - 1000).toISOString();
		const fresh = new Date(NOW - 1000).toISOString();
		const make = async (userId, name, createdAt, verifiedAt = null) => Object.assign(await rows.insert(userId, `${name}@example.com`), { created_at: createdAt, verified_at: verifiedAt });
		const seeded = [await make(USER_A, 'old', stale), await make(USER_A, 'new', fresh), await make(USER_A, 'oldv', stale, fresh), await make(USER_B, 'other', stale)];
		for (const row of seeded) Object.assign(table.rows.find((entry) => entry.id === row.id), { created_at: row.created_at, verified_at: row.verified_at });
		await rows.sweep(USER_A, NOW);
		assert.deepEqual(table.rows.map((row) => row.id), seeded.slice(1).map((row) => row.id));
	});

	it('maps an upstream 23505 to unique_violation and any other failure to email_unavailable', async () => {
		const { table, rows } = setup();
		const row = await rows.insert(USER_A, 'u@example.com');
		table.raise23505 = true;
		await assert.rejects(rows.markVerified(USER_A, row.id, 'x'), { code: 'unique_violation', status: 409 });
		table.raise23505 = false;
		table.fail = () => ({ status: 500 });
		await assert.rejects(rows.list(USER_A), { code: 'email_unavailable', status: 503 });
	});
});

describe('normaliseAddress', () => {
	const accepted = [['  A.B+c@Example.COM ', 'a.b+c@example.com'], ['x@sub.example.co.uk', 'x@sub.example.co.uk']];
	const refused = ['a@b', 'a,b@c.com', 'a@b.co\r\nBcc:x', 'a b@c.co', '"a"@b.co', 'a..b@c.co', '.a@b.co', 'a@b.c0', 'a@-b.co', '', null, 7];

	it('accepts and lowercases a plain address', () => {
		for (const [given, wanted] of accepted) assert.equal(normaliseAddress(given), wanted);
	});

	it('refuses every shape that is not a plain mailbox', () => {
		for (const given of refused) assert.equal(normaliseAddress(given), null, String(given));
	});
});
