/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-emails-verify.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/account/emails/:id/verify: the address proved is the one the ROW holds, the
 * proof is single-use, every row is the caller's, and a verified address is never shared.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hmacOf } from '../../scripts/bridge-account-email-rows.mjs';
import { CODE, createEmailWorld, PATH, USER_A, USER_B } from './support/email-world.mjs';
import { addVerified } from './support/email-helpers.mjs';

const verify = (world, userId, id, body = { code: CODE }) => world.call(userId, { method: 'POST', path: `${PATH}/${id}/verify`, body });
async function pending(world, userId, address) {
	const { body } = await world.add(userId, address);
	await world.drain();
	return body.id;
}

describe('verify', () => {
	it('B10 verifies the row and asks grobase about the OPENED address even when the body carries another', async () => {
		const world = createEmailWorld();
		const id = await pending(world, USER_A, 'row@example.com');
		const result = await verify(world, USER_A, id, { code: CODE, email: 'other@example.com' });
		assert.deepEqual([result.status, result.body.email, result.body.isPrimary], [200, 'row@example.com', false]);
		assert.ok(result.body.verifiedAt);
		assert.deepEqual(world.grobase.verifies.map((entry) => entry.email), ['row@example.com']);
		assert.ok(world.table.audits.some((entry) => entry.event_type === 'account.email_verified'));
	});

	it('B11 rejects a code proven for address X when it is spent on row Y', async () => {
		const world = createEmailWorld();
		const x = await pending(world, USER_A, 'x@example.com');
		const y = await pending(world, USER_A, 'y@example.com');
		world.grobase.handle = ((inner) => async (url, body) => (url.pathname.endsWith('verify') ? inner(url, { ...body, email: 'x@example.com' }) : inner(url, body)))(world.grobase.handle);
		const result = await verify(world, USER_A, y);
		assert.deepEqual([result.status, result.body.code], [502, 'email_proof_invalid']);
		assert.equal(world.table.rows.find((row) => row.id === x).verified_at, null);
		assert.equal(world.table.rows.find((row) => row.id === y).verified_at, null);
	});

	it('B12 refuses a replayed proof with 502 email_proof_invalid and maps wrong, expired and locked codes', async () => {
		const world = createEmailWorld();
		const id = await pending(world, USER_A, 'replay@example.com');
		const proof = (await world.grobase.handle(new URL('http://x/v1/auth/otp/verify'), { email: 'replay@example.com', code: CODE })).json();
		const held = await proof;
		world.grobase.handle = async () => new Response(JSON.stringify({ verified: true, proof: held.proof }), { status: 200, headers: { 'content-type': 'application/json' } });
		assert.equal((await verify(world, USER_A, id)).status, 200);
		world.table.rows[0].verified_at = null;
		const replay = await verify(world, USER_A, id);
		assert.deepEqual([replay.status, replay.body.code], [502, 'email_proof_invalid']);
		assert.ok(world.table.audits.some((entry) => entry.event_type === 'account.email_proof_rejected'));
	});

	it('B12 maps a wrong code to 422, an expired one to 410 and a locked one to 429', async () => {
		for (const [upstream, expected] of [[401, 422], [410, 410], [429, 429]]) {
			const world = createEmailWorld();
			const id = await pending(world, USER_A, 'map@example.com');
			world.grobase.handle = async () => new Response('{}', { status: upstream });
			assert.equal((await verify(world, USER_A, id)).status, expected, String(upstream));
		}
	});

	it('B13 answers 409 email_taken to a second user verifying a verified address, and audits the refusal without it', async () => {
		const world = createEmailWorld();
		await addVerified(world, USER_A, 'both@example.com');
		const id = await pending(world, USER_B, 'both@example.com');
		const result = await verify(world, USER_B, id);
		assert.deepEqual([result.status, result.body.code], [409, 'email_taken']);
		world.grobase.guesses.clear();
		const raced = createEmailWorld();
		await addVerified(raced, USER_A, 'both@example.com');
		const rid = await pending(raced, USER_B, 'both@example.com');
		raced.table.raise23505 = true;
		const race = await verify(raced, USER_B, rid);
		assert.deepEqual([race.status, race.body.code], [409, 'email_taken']);
		const refused = raced.table.audits.filter((entry) => entry.event_type === 'account.email_verify_refused');
		assert.equal(refused.length, 1);
		assert.doesNotMatch(JSON.stringify(refused), /both@example/);
	});

	it('B14 answers 404 to the verify of another user\'s row id', async () => {
		const world = createEmailWorld();
		const id = await pending(world, USER_A, 'mine@example.com');
		const result = await verify(world, USER_B, id);
		assert.deepEqual([result.status, result.body.code, world.grobase.verifies.length], [404, 'not_found', 0]);
	});

	it('B33 answers 200 for an already-verified row without calling grobase or spending a budget', async () => {
		const world = createEmailWorld();
		const row = await addVerified(world, USER_A, 'done@example.com');
		const before = [...world.kv.values.keys()].filter((key) => key.includes('email-verify')).length;
		const result = await verify(world, USER_A, row.id);
		assert.deepEqual([result.status, world.grobase.verifies.length, [...world.kv.values.keys()].filter((key) => key.includes('email-verify')).length], [200, 0, before]);
	});

	it('B24 answers 429 and never reaches grobase on the 11th wrong code for one address over two accounts', async () => {
		const world = createEmailWorld();
		const ids = [await pending(world, USER_A, 'brute@example.com'), await pending(world, USER_B, 'brute@example.com')];
		let last;
		for (let i = 0; i < 11; i += 1) last = await verify(world, i % 2 ? USER_B : USER_A, ids[i % 2], { code: '000000' });
		assert.equal(last.status, 429);
		assert.equal(world.grobase.verifies.length, 10);
	});

	it('B26 answers 503 email_busy on the 301st verify of the hour', async () => {
		const world = createEmailWorld();
		const id = await pending(world, USER_A, 'busy@example.com');
		world.kv.values.set('osb:rl:email-verify:global', '300');
		const result = await verify(world, USER_A, id);
		assert.deepEqual([result.status, result.body.code, world.grobase.verifies.length], [503, 'email_busy', 0]);
	});

	it('B27 refuses with email_taken for a confirmed primary of another account, but not for an unconfirmed one', async () => {
		const world = createEmailWorld({ users: [{ id: 'cccccccc-3333-4333-8333-cccccccccccc', email: 'c@example.com', email_confirmed_at: '2026-09-01T00:00:00Z' }] });
		const id = await pending(world, USER_A, 'c@example.com');
		assert.deepEqual([(await verify(world, USER_A, id)).body.code], ['email_taken']);
		const open = createEmailWorld({ users: [{ id: 'cccccccc-3333-4333-8333-cccccccccccc', email: 'c@example.com', email_confirmed_at: null }] });
		assert.equal((await verify(open, USER_A, await pending(open, USER_A, 'c@example.com'))).status, 200);
	});

	it('B28 B34 answers 503 email_unavailable, not email_taken, on a full lookup page with no exact match', async () => {
		const users = Array.from({ length: 50 }, (_, i) => ({ id: `0000000${i}-0000-4000-8000-000000000000`, email: `y${i}-target@example.com`, email_confirmed_at: '2026-09-01T00:00:00Z' }));
		const world = createEmailWorld({ users });
		const id = await pending(world, USER_A, 'target@example.com');
		const result = await verify(world, USER_A, id);
		assert.deepEqual([result.status, result.body.code], [503, 'email_unavailable']);
		assert.equal(world.table.rows[0].email_hmac, hmacOf('target@example.com', world.env));
	});

	it('M34 does not treat the caller\'s own confirmed account as another owner of the address', async () => {
		const world = createEmailWorld();
		const id = await pending(world, USER_A, 'moved@example.com');
		world.directory.users[USER_A].email = 'moved@example.com';
		assert.equal((await verify(world, USER_A, id)).status, 200);
	});
});
