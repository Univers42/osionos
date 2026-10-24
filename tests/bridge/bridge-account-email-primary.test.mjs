/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-email-primary.test.mjs              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * POST /api/account/emails/:id/primary: the promote-time refusals, the compensation that undoes
 * the kept old primary, the outcomes of an uncertain GoTrue write, sudo spending, the lock and
 * the budget. The world is the shared email world: GoTrue's PUT applies and confirms unless a
 * test overrides it, and every request lands in the directory and table logs.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailRows } from '../../scripts/bridge-account-email-rows.mjs';
import { createEmailWorld, PATH, USER_A, USER_B } from './support/email-world.mjs';
import { addVerified, addressOf, gate } from './support/email-helpers.mjs';

const S = 's@example.com';
const P = 'a@example.com';
const NOBODY = '22222222-2222-4222-8222-222222222222';
const reply = (body, status) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const primary = (world, id) => world.call(USER_A, { method: 'POST', path: `${PATH}/${id}/primary` });
const sudoKeys = (world) => world.kv.keys().filter((key) => key.startsWith('osb:sudo:'));
const rowsOf = (world, userId = USER_A) => world.table.rows.filter((row) => row.user_id === userId);
const addressesOf = (world) => rowsOf(world).map((row) => addressOf(world, row)).sort();
const rowsApi = (world) => createEmailRows({ pg: world.table.pg, env: world.env });
const applied = (world, id) => Object.assign(world.directory.users[id], { email: S });

async function setup(options) {
	const world = createEmailWorld(options);
	const row = await addVerified(world, USER_A, S);
	world.events.length = 0;
	world.directory.calls.length = 0;
	for (const key of sudoKeys(world)) world.kv.values.delete(key);
	return { world, row };
}

const untouched = (world) => assert.deepEqual([world.directory.puts.length, world.directory.calls.some((call) => call.startsWith('GET /auth/v1/admin/users/'))], [0, true], 'a read happened and no PUT');

describe('make primary: the happy path', () => {
	it('P1 puts exactly { email, email_confirm }, keeps the old primary verified and orders the audits around the PUT', async () => {
		const { world, row } = await setup();
		const result = await primary(world, row.id);
		assert.equal(result.status, 200);
		assert.deepEqual(world.directory.puts, [{ id: USER_A, body: { email: S, email_confirm: true } }]);
		assert.deepEqual(world.events.filter((event) => event === 'put' || event.startsWith('audit:account.email_primary')), ['audit:account.email_primary_requested', 'put', 'audit:account.email_primary_changed']);
		const [kept] = rowsOf(world);
		assert.deepEqual([rowsOf(world).length, addressOf(world, kept), Boolean(kept.verified_at), result.body.previous, result.body.primary.email, result.body.primary.isPrimary, result.body.primary._id], [1, P, true, kept.id, S, true, row.id]);
		assert.deepEqual([sudoKeys(world).length, world.table.audits.every((entry) => Object.keys(entry.details).length === 0)], [0, true]);
	});

	it('P17 ends the other sign-ins: the cut-off is written for the caller and the answer says so', async () => {
		const { world, row } = await setup();
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, world.cutoffs.map((entry) => entry.user_id), result.headers['x-session-revoked']], [200, [USER_A], 'all']);
	});

	it('P17 answers 503 email_changed_signout_failed, saying the address HAS changed, when the cut-off fails too', async () => {
		const { world, row } = await setup();
		world.cutoffStatus = 500;
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, result.body.code, /HAS changed/.test(result.body.message), world.cutoffs.length, world.directory.users[USER_A].email], [503, 'email_changed_signout_failed', true, 1, S]);
	});

	it('P23 stays 200 when the changed audit throws', async () => {
		const { world, row } = await setup();
		world.table.failAudit = (body) => body.event_type === 'account.email_primary_changed';
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, world.directory.puts.length], [200, 1]);
	});

	it('P14 lists S once when removing the S row fails, and P14b hides without deleting', async () => {
		const { world, row } = await setup();
		world.table.fail = (op, path) => (op === 'del' && path.includes(row.id) ? { status: 503 } : null);
		assert.equal((await primary(world, row.id)).status, 200);
		world.table.fail = () => null;
		const listed = await world.call(USER_A);
		assert.deepEqual([listed.body.map((entry) => [entry.email, entry.isPrimary]), listed.headers['x-emails-skipped'], world.table.rows.some((entry) => entry.id === row.id)], [[[S, true], [P, false]], '1', true]);
	});

	it('P14b suppresses a secondary equal to the primary, and keeps its row', async () => {
		const world = createEmailWorld();
		const own = await rowsApi(world).insertVerified(USER_A, P, '2026-10-01T00:00:00Z');
		const listed = await world.call(USER_A);
		assert.deepEqual([listed.body.map((entry) => entry.email), listed.headers['x-emails-skipped'], world.table.rows.some((entry) => entry.id === own.id)], [[P], '1', true]);
	});
});

describe('make primary: refusals before any write', () => {
	it('P2 refuses an unverified secondary', async () => {
		const world = createEmailWorld();
		await world.add(USER_A, S);
		const result = await primary(world, rowsOf(world)[0].id);
		assert.deepEqual([result.status, result.body.code, rowsOf(world).length, world.directory.puts.length], [409, 'email_unverified', 1, 0]);
	});

	for (const confirmed of [true, false]) {
		it(`P3 refuses an address another ${confirmed ? 'confirmed' : 'unconfirmed'} account holds`, async () => {
			const { world, row } = await setup();
			world.directory.users[USER_B] = world.user(USER_B, S, confirmed);
			const result = await primary(world, row.id);
			assert.deepEqual([result.status, result.body.code, rowsOf(world).length], [409, 'email_taken', 1]);
			untouched(world);
		});
	}

	it('P4 answers 503 when a full lookup page cannot prove the address free', async () => {
		const { world, row } = await setup();
		for (let index = 0; index < 50; index += 1) world.directory.users[`filler-${index}`] = world.user(`filler-${index}`, `u${index}${S}`);
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, result.body.code, rowsOf(world).length], [503, 'email_unavailable', 1]);
		untouched(world);
	});

	it('P22 refuses an env-listed address like any other taken one, with no audit', async () => {
		const { world, row } = await setup();
		world.config.adminEmails = [S];
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, result.body.code, rowsOf(world).length, world.table.audits.some((entry) => entry.event_type === 'account.email_primary_requested')], [409, 'email_taken', 1, false]);
		untouched(world);
	});

	it('refuses the address that is already the primary', async () => {
		const { world, row } = await setup();
		applied(world, USER_A);
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, result.body.code], [409, 'already_primary']);
		untouched(world);
	});

	it('P12 answers 403 sudo_required with no table or GoTrue request', async () => {
		const { world, row } = await setup();
		world.table.calls.length = 0;
		const result = await world.call(USER_A, { method: 'POST', path: `${PATH}/${row.id}/primary`, sudo: false });
		assert.deepEqual([result.status, result.body.code, world.table.calls.length, world.directory.calls.length], [403, 'sudo_required', 0, 0]);
	});

	it('P13 keeps the 409 for the primary id and the 404 for another user\'s row', async () => {
		const { world, row } = await setup();
		const own = await primary(world, `primary-${USER_A}`);
		const foreign = await world.call(USER_B, { method: 'POST', path: `${PATH}/${row.id}/primary` });
		assert.deepEqual([own.status, foreign.status, foreign.body.code, world.directory.puts.length], [409, 404, 'not_found', 0]);
	});

	it('P15 answers 503 email_unavailable when the keys are unusable', async () => {
		const world = createEmailWorld({ env: { ...createEmailWorld().env, OSIONOS_EMAIL_LOOKUP_KEY: '' } });
		const result = await primary(world, NOBODY);
		assert.deepEqual([result.status, result.body.code, world.directory.calls.length], [503, 'email_unavailable', 0]);
	});
});

describe('make primary: the GoTrue write and its compensation', () => {
	const cases = [
		['P5 a 23505 is email_taken', () => reply({ code: '23505' }, 500), [409, 'email_taken']],
		['a 422 email_exists is email_taken', () => reply({ error_code: 'email_exists' }, 422), [409, 'email_taken']],
		['a 429 with a JSON body is still unknown, and the re-read shows P', () => reply({ msg: 'slow down' }, 429), [503, 'email_unavailable']],
		['P6 a definite 4xx is 503', () => reply({ msg: 'bad' }, 400), [503, 'email_unavailable']],
		['P6\'\' an unparseable 503 that left P is 503', () => reply('<html>bad gateway', 503), [503, 'email_unavailable']],
		['P8 a timeout that left P is 503', () => { throw new Error('timeout'); }, [503, 'email_unavailable']],
	];
	for (const [name, onPut, [status, code]] of cases) {
		it(`${name}: the created P row is deleted, S intact, the grant restored`, async () => {
			const { world, row } = await setup();
			world.directory.onPut = onPut;
			const result = await primary(world, row.id);
			assert.deepEqual([result.status, result.body.code, world.directory.puts.length], [status, code, 1]);
			assert.deepEqual([addressesOf(world), sudoKeys(world).length, world.events.includes('delete')], [[S], 1, true]);
		});
	}

	it('P6\' an unparseable 503 that LANDED is a success: S goes, P stays', async () => {
		const { world, row } = await setup();
		world.directory.onPut = (id) => { applied(world, id); return reply('<html>bad gateway', 503); };
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, addressesOf(world), result.body.previous === rowsOf(world)[0].id], [200, [P], true]);
	});

	it('P7 a timeout that LANDED is a success', async () => {
		const { world, row } = await setup();
		world.directory.onPut = (id) => { applied(world, id); throw new Error('timeout'); };
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, addressesOf(world)], [200, [P]]);
	});

	it('P9 a timeout whose re-read fails is 503 and keeps the P row', async () => {
		const { world, row } = await setup();
		world.directory.onPut = () => { world.directory.fail = true; throw new Error('timeout'); };
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, addressesOf(world), world.events.includes('delete')], [503, [P, S], false]);
	});
});

describe('make primary: what is kept as the old primary', () => {
	it('P10 keeps nothing when another user verified P', async () => {
		const { world, row } = await setup();
		await rowsApi(world).insertVerified(USER_B, P, '2026-10-01T00:00:00Z');
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, result.body.previous, rowsOf(world).length], [200, null, 0]);
	});

	it('P11 reuses the caller\'s own unverified P row and does not delete it on compensation', async () => {
		const { world, row } = await setup();
		const own = await rowsApi(world).insert(USER_A, P);
		world.directory.onPut = () => reply({ code: '23505' }, 500);
		const failed = await primary(world, row.id);
		assert.deepEqual([failed.status, rowsOf(world).some((entry) => entry.id === own.id), world.table.rows.find((entry) => entry.id === own.id).verified_at !== null], [409, true, true]);
		world.directory.onPut = null;
		const retried = await world.call(USER_A, { method: 'POST', path: `${PATH}/${row.id}/primary` });
		assert.deepEqual([retried.status, retried.body.previous], [200, own.id]);
	});

	it('P20 keeps nothing when GoTrue does not confirm the old primary', async () => {
		const { world, row } = await setup();
		world.directory.users[USER_A].email_confirmed_at = null;
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, result.body.previous, rowsOf(world).length], [200, null, 0]);
	});

	it('P21 answers previous null when the insert hits the index and the caller has no own row', async () => {
		const { world, row } = await setup();
		world.table.raise23505 = true;
		const result = await primary(world, row.id);
		assert.deepEqual([result.status, result.body.previous, world.directory.puts.length], [200, null, 1]);
	});
});

describe('make primary: sudo, lock and budget', () => {
	it('P18 spends the grant: a repeat without a new sudo is 403', async () => {
		const { world, row } = await setup();
		const token = await world.token(USER_A);
		const path = `${PATH}/${row.id}/primary`;
		const first = await world.callWith(token, { path });
		const again = await world.callWith(token, { path });
		assert.deepEqual([first.status, again.status, again.body.code, world.directory.puts.length], [200, 403, 'sudo_required', 1]);
	});

	it('P16 lets one of two parallel requests through; the other is 409 primary_busy', async () => {
		const { world, row } = await setup();
		const held = gate();
		world.directory.hold = held.promise;
		const first = primary(world, row.id);
		while (!world.directory.calls.some((call) => call.includes('?filter='))) await new Promise((resolve) => setImmediate(resolve));
		const second = await primary(world, row.id);
		held.open();
		const winner = await first;
		assert.deepEqual([winner.status, second.status, second.body.code, world.directory.puts.length, addressesOf(world)], [200, 409, 'primary_busy', 1, [P]]);
		assert.equal(world.kv.has(`email-primary:${USER_A}`), false, 'the lock is released');
	});

	it('P19 answers 429 on the sixth call in the window, with no PUT', async () => {
		const world = createEmailWorld();
		const statuses = [];
		for (let call = 0; call < 6; call += 1) statuses.push((await primary(world, NOBODY)).status);
		assert.deepEqual([statuses, world.directory.puts.length], [[404, 404, 404, 404, 404, 429], 0]);
	});
});
