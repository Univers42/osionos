/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-emails-add.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/account/emails through the real account handler: sudo first, the audit before
 * the row and the row before any mail, an answer that is the same for four availability
 * states, and counters that advance whatever the address is.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hmacOf } from '../../scripts/bridge-account-email-rows.mjs';
import { createEmailWorld, PATH, USER_A, USER_B } from './support/email-world.mjs';
import { addressOf, addVerified, counterShape, gate, observable } from './support/email-helpers.mjs';

const GOTRUE_USER = 'cccccccc-3333-4333-8333-cccccccccccc';
const UUID = '11111111-1111-4111-8111-111111111111';

const CASES = [
	{ name: 'free', address: 'xfree@example.com', mails: 1, setup: async () => {} },
	{ name: 'verified by another user', address: 'xtaken@example.com', mails: 0, setup: (world) => addVerified(world, USER_B, 'xtaken@example.com') },
	{ name: 'confirmed primary of another account', address: 'xprime@example.com', mails: 0, setup: (world) => { world.directory.users[GOTRUE_USER] = world.user(GOTRUE_USER, 'xprime@example.com'); } },
	{ name: 'own pending', address: 'xowned@example.com', mails: 1, setup: async (world) => { await world.add(USER_A, 'xowned@example.com'); await world.drain(); world.grobase.requests.length = 0; } },
	{ name: 'own verified', address: 'xmine@example.com', mails: 0, setup: (world) => addVerified(world, USER_A, 'xmine@example.com') },
];

describe('add: sudo and routing', () => {
	it('B1 answers 403 sudo_required to each mutating route with no database, mail or GoTrue call', async () => {
		const world = createEmailWorld();
		for (const [method, path, body] of [['POST', PATH, { email: 'x@example.com' }], ['POST', `${PATH}/${UUID}/code`], ['POST', `${PATH}/${UUID}/verify`, { code: '123456' }], ['DELETE', `${PATH}/${UUID}`]]) {
			const result = await world.call(USER_A, { method, path, body, sudo: false });
			assert.deepEqual([result.status, result.body.code], [403, 'sudo_required'], `${method} ${path}`);
		}
		assert.deepEqual([world.table.calls.length, world.table.audits.length, world.grobase.requests.length, world.directory.calls.length], [0, 0, 0, 0]);
	});

	it('B20 B9 answers 404 not_found to make-primary and to GET on a sub-path, with no GoTrue call', async () => {
		const world = createEmailWorld();
		for (const [method, path] of [['POST', `${PATH}/${UUID}/make-primary`], ['GET', `${PATH}/x`], ['PUT', PATH]]) {
			const result = await world.call(USER_A, { method, path });
			assert.deepEqual([result.status, result.body.code], [method === 'PUT' ? 405 : 404, method === 'PUT' ? 'method_not_allowed' : 'not_found'], `${method} ${path}`);
		}
		assert.equal(world.directory.calls.length, 0);
	});
});

describe('add: effects and order', () => {
	it('B2 writes the audit before the row and the row before the mail; the stored address is sealed and hashed', async () => {
		const world = createEmailWorld();
		const result = await world.add(USER_A, 'New.Person@Example.com');
		await world.drain();
		assert.equal(result.status, 202);
		assert.deepEqual(world.events, ['audit:account.email_add_requested', 'insert', 'otp-request']);
		const [row] = world.table.rows;
		assert.equal(row.email_enc.includes('@'), false);
		assert.equal(addressOf(world, row), 'new.person@example.com');
		assert.equal(row.email_hmac, hmacOf('new.person@example.com', world.env));
		assert.equal(result.body.id, row.id);
		assert.deepEqual(world.grobase.requests, ['new.person@example.com']);
	});

	it('B3 B3n answers the same to four availability states, and only the free one is mailed', async () => {
		const seen = [];
		for (const { name, address, mails, setup } of CASES) {
			const world = createEmailWorld();
			await setup(world);
			world.grobase.requests.length = 0;
			const result = await world.add(USER_A, address);
			await world.drain();
			seen.push(observable({ ...result, body: { ...result.body, id: 'x' } }));
			assert.equal(world.grobase.requests.length, mails, name);
		}
		assert.equal(new Set(seen).size, 1, seen.join('\n'));
	});

	it('B3t answers 202 for each state while grobase and the GoTrue list never answer, then settles', async () => {
		for (const { name, address, setup } of CASES) {
			const world = createEmailWorld();
			await setup(world);
			const held = gate();
			world.grobase.hold = held.promise;
			world.directory.hold = held.promise;
			assert.equal((await world.add(USER_A, address)).status, 202, name);
			held.open();
			await world.drain();
		}
	});

	it('B4b leaves the same counters whatever the availability of the address', async () => {
		const shapes = [];
		for (const { address, setup } of CASES) {
			const world = createEmailWorld();
			await setup(world);
			world.kv.values.clear();
			await world.add(USER_A, address);
			await world.drain();
			const { targets, ...rest } = counterShape(world.kv);
			shapes.push(JSON.stringify([rest, targets.length]));
		}
		assert.equal(new Set(shapes).size, 1, shapes.join('\n'));
	});

	it('B23 re-adding the own verified address is 202 with no mail and no second row', async () => {
		const world = createEmailWorld();
		await addVerified(world, USER_A, 'mine@example.com');
		world.grobase.requests.length = 0;
		assert.equal((await world.add(USER_A, 'mine@example.com')).status, 202);
		await world.drain();
		assert.deepEqual([world.table.rows.length, world.grobase.requests.length], [1, 0]);
	});
});

describe('add: refusals', () => {
	it('B7 answers 422 invalid_email for each malformed shape, with nothing written', async () => {
		const world = createEmailWorld();
		for (const email of ['a@b', `${'a'.repeat(250)}@b.co`, 'a\u0001@b.co', 'a@@b.co', 'a@b@c.co', 'a,b@c.com', '"a"@b.co', 'a@b.co\r\nBcc:x', 'a..b@c.co', '.a@b.co', 42, undefined]) {
			const result = await world.add(USER_A, email);
			assert.deepEqual([result.status, result.body.code], [422, 'invalid_email'], String(email).slice(0, 20));
		}
		assert.deepEqual([world.table.rows.length, world.table.audits.length], [0, 0]);
	});

	it('B8 answers 409 already_primary for the own primary in any case', async () => {
		const world = createEmailWorld();
		const result = await world.add(USER_A, 'A@Example.com');
		assert.deepEqual([result.status, result.body.code, world.table.rows.length], [409, 'already_primary', 0]);
	});

	it('B6 answers 409 too_many_pending for a fourth pending address, but a swept row frees a slot', async () => {
		const world = createEmailWorld();
		for (const name of ['p1', 'p2', 'p3']) assert.equal((await world.add(USER_A, `${name}@example.com`)).status, 202);
		const refused = await world.add(USER_A, 'p4@example.com');
		assert.deepEqual([refused.status, refused.body.code], [409, 'too_many_pending']);
		world.clock.at += 3_600_001;
		for (const row of world.table.rows) row.created_at = '2026-10-24T08:00:00.000Z';
		assert.equal((await world.add(USER_A, 'p4@example.com')).status, 202);
		assert.equal(world.table.rows.length, 1);
		await world.drain();
	});

	it('B32 answers 404 not_found to a non-UUID id on resend, verify and remove, with no database call', async () => {
		const world = createEmailWorld();
		for (const id of ['x', '1', '..%2Fx']) {
			for (const [method, suffix] of [['POST', '/code'], ['POST', '/verify'], ['DELETE', '']]) {
				const result = await world.call(USER_A, { method, path: `${PATH}/${id}${suffix}`, body: { code: '123456' } });
				assert.deepEqual([result.status, result.body.code], [404, 'not_found'], `${method} ${id}${suffix}`);
			}
		}
		assert.equal(world.table.calls.length, 0);
	});
});
