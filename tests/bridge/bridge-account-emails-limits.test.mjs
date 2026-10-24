/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-emails-limits.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The budgets and the failure modes of add and resend: per-user limits answer 429, per-target
 * and global limits withhold the mail and keep the answer, and an outage is a 503 with
 * nothing written. No log or audit row carries an address, a code or a proof.
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailWorld, PATH, USER_A, USER_B } from './support/email-world.mjs';
import { addVerified, counterShape } from './support/email-helpers.mjs';

const resend = (world, userId, id) => world.call(userId, { method: 'POST', path: `${PATH}/${id}/code` });

describe('send budgets', () => {
	it('B4 withholds the fourth mail to one address within the hour across two users, still answering 202', async () => {
		const world = createEmailWorld();
		for (const userId of [USER_A, USER_B, USER_A, USER_B]) assert.equal((await world.add(userId, 'shared@example.com')).status, 202);
		await world.drain();
		assert.equal(world.grobase.requests.length, 3);
	});

	it('B4b resend advances send, target and global counters but not email-add', async () => {
		const world = createEmailWorld();
		const { body } = await world.add(USER_A, 'r@example.com');
		await world.drain();
		const before = counterShape(world.kv);
		assert.equal((await resend(world, USER_A, body.id)).status, 202);
		const after = counterShape(world.kv);
		const grown = Object.keys(after).filter((key) => key !== 'targets' && after[key] !== before[key]);
		assert.deepEqual(grown.map((key) => key.replace(/^.*(email-[a-z]+).*$/, '$1')).sort(), ['email-send', 'email-send']);
		assert.deepEqual([after.targets[0], before.targets[0]], [2, 1]);
	});

	it('B5 answers 429 rate_limited with retryAfterSeconds past 5 adds in 10 minutes', async () => {
		const world = createEmailWorld();
		for (const name of ['q1', 'q2', 'q3']) await world.add(USER_A, `${name}@example.com`);
		await world.add(USER_A, 'q1@example.com');
		await world.add(USER_A, 'q2@example.com');
		const result = await world.add(USER_A, 'q3@example.com');
		assert.deepEqual([result.status, result.body.code, result.body.retryAfterSeconds], [429, 'rate_limited', 600]);
	});

	it('B5 answers 429 on the sixth resend of one row', async () => {
		const world = createEmailWorld();
		const { body } = await world.add(USER_A, 'r@example.com');
		const statuses = [];
		for (let i = 0; i < 5; i += 1) statuses.push((await resend(world, USER_A, body.id)).status);
		assert.deepEqual(statuses, [202, 202, 202, 202, 429]);
	});

	it('B25 withholds the 61st send of the hour across users without changing the answer', async () => {
		const world = createEmailWorld();
		world.kv.values.set('osb:rl:email-send:global', '60');
		const result = await world.add(USER_A, 'g@example.com');
		await world.drain();
		assert.deepEqual([result.status, world.grobase.requests.length], [202, 0]);
	});

	it('B22 resend on a row verified by another user, or the own verified row, is 202 with no mail', async () => {
		const world = createEmailWorld();
		const pending = (await world.add(USER_A, 'dup@example.com')).body.id;
		await addVerified(world, USER_B, 'dup@example.com');
		const own = await addVerified(world, USER_A, 'own@example.com');
		world.grobase.requests.length = 0;
		for (const id of [pending, own.id]) assert.equal((await resend(world, USER_A, id)).status, 202);
		await world.drain();
		assert.equal(world.grobase.requests.length, 0);
	});

	it('B28 adds on a full lookup page with no exact match as 202 and no mail', async () => {
		const users = Array.from({ length: 50 }, (_, i) => ({ id: `0000000${i}-0000-4000-8000-000000000000`, email: `y${i}-target@example.com`, email_confirmed_at: '2026-09-01T00:00:00Z' }));
		const world = createEmailWorld({ users });
		const result = await world.add(USER_A, 'target@example.com');
		await world.drain();
		assert.deepEqual([result.status, world.grobase.requests.length], [202, 0]);
	});
});

describe('failure handling', () => {
	it('B17 keeps the row and answers 202 when grobase fails; the sweep removes it an hour on; the log has a code and no address', async (t) => {
		const log = t.mock.method(console, 'error', () => {});
		const world = createEmailWorld();
		world.grobase.requestStatus = 502;
		const result = await world.add(USER_A, 'fails@example.com');
		await world.drain();
		assert.deepEqual([result.status, world.table.rows.length], [202, 1]);
		const lines = log.mock.calls.map((call) => call.arguments.join(' '));
		assert.ok(lines.some((line) => line.includes('account_email_task_failed')), lines.join('|'));
		assert.doesNotMatch(lines.join('|'), /fails@example/);
		world.clock.at += 3_600_001;
		world.table.rows[0].created_at = '2026-10-24T08:00:00.000Z';
		world.grobase.requestStatus = 200;
		await world.add(USER_A, 'next@example.com');
		await world.drain();
		assert.deepEqual(world.table.rows.map((row) => row.email_hmac).length, 1);
	});

	it('B17 answers 503 email_unavailable with no row, audit or mail when the kv is down', async () => {
		const world = createEmailWorld();
		world.kv.incrWithTtl = async () => { throw Object.assign(new Error('down'), { status: 503, code: 'kv_unavailable' }); };
		const result = await world.add(USER_A, 'kv@example.com');
		await world.drain();
		assert.deepEqual([result.status, result.body.code, world.table.rows.length, world.table.audits.length, world.grobase.requests.length], [503, 'email_unavailable', 0, 0, 0]);
	});

	it('B17 answers 503 email_unavailable with no mail when the insert fails', async () => {
		const world = createEmailWorld();
		world.table.fail = (op) => (op === 'post' ? { status: 503 } : null);
		const result = await world.add(USER_A, 'pg@example.com');
		await world.drain();
		assert.deepEqual([result.status, result.body.code, world.grobase.requests.length], [503, 'email_unavailable', 0]);
	});

	it('B18 leaves no address, code or proof in the captured log or the audit rows', async (t) => {
		const log = t.mock.method(console, 'error', () => {});
		const world = createEmailWorld();
		world.grobase.requestStatus = 502;
		await world.add(USER_A, 'secret.person@example.com');
		await world.drain();
		const captured = log.mock.calls.map((call) => call.arguments.join(' ')).join('|');
		assert.ok(captured.length > 0);
		assert.ok(world.table.audits.length > 0);
		assert.doesNotMatch(captured + JSON.stringify(world.table.audits), /secret\.person|example\.com|123456|otp-proof/);
	});
});
