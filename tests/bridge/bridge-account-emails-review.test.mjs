/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-emails-review.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Review round for the secondary-email routes: a malformed id is a 404, two racing adds of
 * one address are one row, a failing counter store fails closed, and a resend looks the
 * same whatever state the address is in.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailWorld, PATH, USER_A, USER_B } from './support/email-world.mjs';
import { addVerified, observable } from './support/email-helpers.mjs';

const BAD_ID = '%E0%A4%A';
const resend = (world, userId, id) => world.call(userId, { method: 'POST', path: `${PATH}/${id}/code` });
const failKv = (world, part) => {
	const inner = world.kv.incrWithTtl;
	world.kv.incrWithTtl = async (key, ...rest) => {
		if (key.includes(part)) throw new Error('kv down');
		return inner(key, ...rest);
	};
};

describe('malformed id', () => {
	for (const [method, suffix, body] of [['POST', '/code'], ['POST', '/verify', { code: '123456' }], ['DELETE', '']]) {
		it(`R1 answers 404 not_found to ${method} ${suffix || 'the id'} with a bad percent-escape`, async () => {
			const world = createEmailWorld();
			const result = await world.call(USER_A, { method, path: `${PATH}/${BAD_ID}${suffix}`, body });
			assert.deepEqual([result.status, result.body.code], [404, 'not_found']);
		});
	}
});

describe('racing adds', () => {
	it('R2 answers 202 to both adds of one address by one user and keeps one row', async () => {
		const world = createEmailWorld();
		const [first, second] = await Promise.all([world.add(USER_A, 'race@example.com'), world.add(USER_A, 'race@example.com')]);
		await world.drain();
		assert.deepEqual([first.status, second.status, world.table.rows.length], [202, 202, 1]);
		assert.equal(first.body.id, second.body.id);
	});

	it('R2 reuses the row when the insert loses the unique index to a row the lookup missed', async () => {
		const world = createEmailWorld();
		const first = await world.add(USER_A, 'late@example.com');
		await world.drain();
		const rows = world.table.rows;
		let reads = 0;
		const get = world.table.pg.asService().get;
		world.table.pg.asService().get = async (path) => (reads++ === 0 && path.includes('email_hmac') ? [] : get(path));
		const second = await world.add(USER_A, 'late@example.com');
		assert.deepEqual([second.status, second.body.id, rows.length], [202, first.body.id, 1]);
	});
});

describe('counter store down', () => {
	for (const part of ['rl:email-target:', 'rl:email-send:global']) {
		it(`R5 add fails closed with 503 email_unavailable when the ${part} counter throws`, async () => {
			const world = createEmailWorld();
			failKv(world, part);
			const result = await world.add(USER_A, 'down@example.com');
			assert.deepEqual([result.status, result.body.code, world.table.rows.length], [503, 'email_unavailable', 0]);
		});
	}

	it('R5 verify fails closed with 503 email_unavailable when the global verify counter throws', async () => {
		const world = createEmailWorld();
		const { body } = await world.add(USER_A, 'v@example.com');
		await world.drain();
		failKv(world, 'rl:email-verify:global');
		const result = await world.call(USER_A, { method: 'POST', path: `${PATH}/${body.id}/verify`, body: { code: '123456' } });
		assert.deepEqual([result.status, result.body.code, world.table.rows[0].verified_at], [503, 'email_unavailable', null]);
	});
});

describe('resend uniformity', () => {
	const OTHER = 'cccccccc-3333-4333-8333-cccccccccccc';
	const CASES = [
		['free', async () => {}],
		['verified by another user', (world, address) => addVerified(world, USER_B, address)],
		['confirmed primary elsewhere', (world, address) => { world.directory.users[OTHER] = world.user(OTHER, address); }],
		['unconfirmed primary elsewhere', (world, address) => { world.directory.users[OTHER] = world.user(OTHER, address, false); }],
	];

	it('R5 answers a resend with the same status, body keys and headers in all four states', async () => {
		const seen = [];
		for (const [, setup] of CASES) {
			const world = createEmailWorld();
			const { body } = await world.add(USER_A, 'same@example.com');
			await world.drain();
			await setup(world, 'same@example.com');
			seen.push(observable(await resend(world, USER_A, body.id)));
		}
		assert.equal(new Set(seen).size, 1, seen.join('\n'));
	});
});
