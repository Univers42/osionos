/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-erasure.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The deletion executor on a fake that keeps one ordered call log. What these tests pin:
 * the order of the steps, that a stopped or failed user is never half-erased, that the
 * dry run writes nothing, and that every crash point is finished by the next run.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BATCH_WAIT_MS, CLAIM_BATCH, TAKE_NO_MORE_MS, createAccountErasureRunner } from '../../scripts/bridge-account-erasure.mjs';
import { createErasureWorld, indexOfStep } from './support/account-erasure-world.mjs';
import { kvStub } from './support/kv-stub.mjs';

const ids = (n) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-00000000000${i + 1}`);
const [U1, U2] = ids(2);
const LEASE_PLUS = 31 * 60_000;

const objectsFor = (user) => ({ [user]: [{ bucket: 'avatars', key: `${user}/a.png` }, { bucket: 'account-exports', key: 'e1.zip' }] });
const runner = (w, env = {}) => createAccountErasureRunner(w.runnerDeps({ env: { ...w.env, ...env } }));
const writes = (log) => log.filter((entry) => !entry.startsWith('info:') && !entry.startsWith('warn:') && !entry.startsWith('read_request'));

describe('mode switches', () => {
	it('is off without OSIONOS_ACCOUNT_DELETION_EXECUTOR', async () => {
		const w = createErasureWorld({ users: [U1] });
		const r = runner(w, { OSIONOS_ACCOUNT_DELETION_EXECUTOR: '0' });
		assert.equal(r.mode, 'off');
		assert.equal(await r.runOnce(), 0);
		assert.deepEqual(w.log, []);
	});

	it('is off when the account plane is not configured', async () => {
		const w = createErasureWorld({ users: [U1] });
		const r = createAccountErasureRunner(w.runnerDeps({ config: {} }));
		assert.equal(r.mode, 'off');
	});

	it('refuses to start live in production without a dry run or the verdict, naming variables only', async () => {
		const w = createErasureWorld({ users: [U1] });
		const r = runner(w, { NODE_ENV: 'production' });
		assert.equal(r.mode, 'refused');
		r.start();
		assert.equal(await r.runOnce(), 0);
		const warning = w.log.find((entry) => entry.startsWith('warn:'));
		assert.match(warning, /OSIONOS_ACCOUNT_DELETION_VERDICT/);
		assert.equal(w.log.some((entry) => entry === 'claim'), false);
	});

	it('goes live in production once the verdict constant is set, and dry with DRY_RUN', () => {
		const w = createErasureWorld({ users: [U1] });
		assert.equal(runner(w, { NODE_ENV: 'production', OSIONOS_ACCOUNT_DELETION_VERDICT: 'D-P5-6' }).mode, 'live');
		assert.equal(runner(w, { NODE_ENV: 'production', OSIONOS_ACCOUNT_DELETION_DRY_RUN: '1' }).mode, 'dry');
	});

	it('starts and stops its unref-ed timer when live', () => {
		const r = runner(createErasureWorld({ users: [U1] }));
		r.start();
		r.stop();
	});
});

describe('dry run', () => {
	it('reads the due list and the plan, and writes nothing', async () => {
		const w = createErasureWorld({ users: [U1, U2] });
		const handled = await runner(w, { OSIONOS_ACCOUNT_DELETION_DRY_RUN: '1' }).runOnce();
		assert.equal(handled, 2, 'the fake returned due users, an empty list must not pass');
		assert.deepEqual(w.log.filter((entry) => !entry.startsWith('info:')), ['due', `plan:${U1}`, `plan:${U2}`]);
		assert.equal(w.log.filter((entry) => entry.startsWith('info:account_deletion_dry_run')).length, 2);
		assert.equal(w.log.join('\n').includes(U1), true, 'the call log has the id, the printed line must not');
		assert.equal(w.log.filter((entry) => entry.startsWith('info:')).some((entry) => entry.includes(U1)), false);
		assert.equal(w.requests.get(U1).claimed_at, null);
	});
});

describe('live run', () => {
	it('runs the steps in order and deletes everything', async () => {
		const w = createErasureWorld({ users: [U1], objects: objectsFor(U1) });
		await runner(w).runOnce();
		const steps = writes(w.log);
		assert.deepEqual(steps.map((entry) => entry.split(':')[0] === 'audit' ? entry.split(':').slice(0, 2).join(':') : entry.split(':')[0]), [
			'claim', 'audit:account.deletion_executing', 'cutoff', 'ban', 'pat_revoke', 'erase', 'sleep', 'erase',
			'object_delete', 'object_delete', 'objects_rows_delete', 'gotrue_delete', 'audit:account.deleted',
		]);
		assert.deepEqual(w.sleeps, [BATCH_WAIT_MS]);
		assert.equal(w.deletedAuth.has(U1), true);
		assert.deepEqual(w.objects.get(U1), []);
		assert.equal(w.requests.has(U1), false);
		assert.ok(indexOfStep(w.log, 'ban') < indexOfStep(w.log, 'erase'));
	});

	it('erases a write made by a still-valid token between the two passes', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.after.sleep = () => w.data.get(U1).push('late');
		await runner(w).runOnce();
		assert.deepEqual(w.data.get(U1), []);
		assert.equal(w.erases.get(U1), 2);
	});

	it('writes account.deleted with counts and the successor outcome, and no e-mail', async () => {
		const w = createErasureWorld({ users: [U1] });
		await runner(w).runOnce();
		const row = w.audits.find((audit) => audit.event_type === 'account.deleted');
		assert.deepEqual(Object.keys(row.details).sort(), ['counts', 'dispositions', 'successor']);
		assert.equal(row.details.successor, 'none');
		assert.equal(JSON.stringify(row).includes('@'), false);
	});

	it('does not run any step when the audit store is down', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.fail.add('audit:account.deletion_executing');
		await runner(w).runOnce();
		assert.deepEqual(writes(w.log).filter((entry) => /^(cutoff|ban|pat_revoke|erase|gotrue_delete)/.test(entry)), []);
		assert.equal(w.requests.get(U1).last_error, 'audit_unavailable');
	});

	for (const [label, code] of [['ban', 'ban_failed'], ['cutoff', 'cutoff_failed'], ['pat_revoke', 'pat_revoke_failed']]) {
		it(`aborts the user with ${code} and never erases`, async () => {
			const w = createErasureWorld({ users: [U1] });
			w.fail.add(label);
			await runner(w).runOnce();
			assert.equal(w.requests.get(U1).last_error, code);
			assert.equal(w.requests.get(U1).attempts, 1, 'the bridge does not add an attempt of its own');
			assert.equal(w.log.some((entry) => entry.startsWith('erase')), false);
			assert.equal(w.deletedAuth.size, 0);
		});
	}

	it('leaves the GoTrue user alone when the erase fails and records a code only', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.fail.add('erase');
		await runner(w).runOnce();
		assert.equal(w.requests.get(U1).last_error, 'erase_failed');
		assert.equal(w.deletedAuth.size, 0);
	});

	it('keeps the request when the GoTrue delete fails, and the next run finishes it', async () => {
		const w = createErasureWorld({ users: [U1], objects: objectsFor(U1) });
		w.fail.add('gotrue_delete');
		await runner(w).runOnce();
		assert.equal(w.requests.get(U1).last_error, 'auth_delete_failed');
		w.fail.clear();
		w.clock.at += LEASE_PLUS;
		await runner(w).runOnce();
		assert.equal(w.deletedAuth.has(U1), true);
		assert.equal(w.requests.has(U1), false);
	});

	it('finishes the work after a kill between every adjacent pair of steps', async () => {
		const probe = createErasureWorld({ users: [U1], objects: objectsFor(U1) });
		await runner(probe).runOnce();
		const total = probe.count;
		assert.ok(total >= 13);
		for (let kill = 1; kill <= total; kill += 1) {
			const w = createErasureWorld({ users: [U1], objects: objectsFor(U1) });
			w.killAfter = kill;
			await runner(w).runOnce();
			w.crashed = false;
			w.killAfter = 0;
			w.clock.at += LEASE_PLUS;
			await runner(w).runOnce();
			assert.equal(w.deletedAuth.has(U1), true, `kill after operation ${kill}`);
			assert.deepEqual(w.objects.get(U1), [], `kill after operation ${kill}`);
			assert.deepEqual(w.data.get(U1), [], `kill after operation ${kill}`);
		}
	});

	it('does nothing but read when the user cancelled between the claim and step 0', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.after.claimed = () => w.requests.delete(U1);
		await runner(w).runOnce();
		assert.deepEqual(writes(w.log), ['claim']);
	});

	it('unbans and stops when the request vanishes after the ban', async () => {
		const w = createErasureWorld({ users: [U1], objects: objectsFor(U1) });
		w.after.pat_revoke = (user) => w.requests.delete(user);
		await runner(w).runOnce();
		assert.ok(w.log.includes(`unban:${U1}`));
		assert.ok(w.log.includes('info:account_deletion_cancelled_after_ban 3ab89ec6'.replace('3ab89ec6', w.log.find((e) => e.startsWith('info:account_deletion_cancelled_after_ban')).split(' ')[1])));
		assert.equal(w.log.some((entry) => entry.startsWith('object_delete') || entry.startsWith('gotrue_delete')), false);
	});
});

describe('batches and leases', () => {
	it('claims five of six, waits once per batch, and the second run takes only the sixth', async () => {
		const w = createErasureWorld({ users: ids(6) });
		await runner(w).runOnce();
		assert.equal(w.log.filter((entry) => entry === 'sleep').length, 1);
		assert.equal(w.deletedAuth.size, CLAIM_BATCH);
		await runner(w).runOnce();
		assert.equal(w.deletedAuth.size, 6);
		for (const user of ids(6)) assert.equal(w.log.filter((entry) => entry === `gotrue_delete:${user}`).length, 1);
	});

	it('lets two runners over one fake claim disjoint users', async () => {
		const w = createErasureWorld({ users: ids(6) });
		await Promise.all([runner(w).runOnce(), runner(w).runOnce()]);
		assert.equal(w.deletedAuth.size, 6);
		for (const user of ids(6)) assert.equal(w.erases.get(user), 2);
	});

	it('takes no user after 20 minutes and leaves it claimable once its lease ends', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.after.claimed = () => { w.clock.at += TAKE_NO_MORE_MS + 1; };
		await runner(w).runOnce();
		assert.equal(w.log.includes('sleep'), false);
		assert.equal(w.requests.get(U1).erased_at, null);
		w.after.claimed = undefined;
		await runner(w).runOnce();
		assert.equal(w.deletedAuth.size, 0, 'the lease still holds');
		w.clock.at += LEASE_PLUS;
		await runner(w).runOnce();
		assert.equal(w.deletedAuth.has(U1), true);
	});

	it('logs the stuck count and never claims a user at five attempts', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.requests.get(U1).attempts = 5;
		await runner(w).runOnce();
		assert.ok(w.log.includes('warn:account_deletion_stuck 1'));
		assert.equal(w.deletedAuth.size, 0);
	});

	it('logs a lost account.deleted row and does not retry it', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.fail.add('audit:account.deleted');
		await runner(w).runOnce();
		assert.equal(w.deletedAuth.has(U1), true);
		assert.equal(w.log.filter((entry) => entry.startsWith('audit:account.deleted')).length, 1);
		assert.ok(w.log.some((entry) => entry.startsWith('warn:account_deleted_audit_lost')));
	});
});

describe('boundaries', () => {
	it('never touches the session table', () => {
		assert.equal(readFileSync(new URL('../../scripts/bridge-account-erasure.mjs', import.meta.url), 'utf8').includes('osionos_sessions'), false);
	});
});

describe('the devil conditions', () => {
	for (const verdict of ['0', 'false', 'x', '1']) {
		it(`refuses production with VERDICT=${JSON.stringify(verdict)}`, () => {
			const w = createErasureWorld({ users: [U1] });
			assert.equal(runner(w, { NODE_ENV: 'production', OSIONOS_ACCOUNT_DELETION_VERDICT: verdict }).mode, 'refused');
		});
	}

	it('aborts with ban_failed when the ban answers 200 without banned_until', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.banReply = 'no_effect';
		await runner(w).runOnce();
		assert.equal(w.requests.get(U1).last_error, 'ban_failed');
		assert.deepEqual(writes(w.log).filter((entry) => /^(pat_revoke|erase|sleep|object_delete|gotrue_delete)/.test(entry)), []);
	});

	it('treats a GoTrue 404 user_not_found as already deleted', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.deleteReply = 'gone';
		await runner(w).runOnce();
		assert.equal(w.requests.has(U1), false);
		assert.equal(w.audits.some((audit) => audit.event_type === 'account.deleted'), true);
	});

	it('keeps the request on a Kong 404 and records auth_delete_failed', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.deleteReply = 'kong';
		await runner(w).runOnce();
		assert.equal(w.requests.get(U1).last_error, 'auth_delete_failed');
		assert.equal(w.audits.some((audit) => audit.event_type === 'account.deleted'), false);
	});

	it('warns banned_without_request and retries the unban on a later run, from a fresh runner', async () => {
		const w = createErasureWorld({ users: [U1] });
		const kv = kvStub();
		w.after.pat_revoke = (user) => w.requests.delete(user);
		w.fail.add('unban');
		await createAccountErasureRunner(w.runnerDeps({ kv })).runOnce();
		assert.equal(w.log.filter((entry) => /^warn:banned_without_request [0-9a-f]{8}$/.test(entry)).length, 1);
		const before = w.log.filter((entry) => entry === `unban:${U1}`).length;
		w.fail.clear();
		await createAccountErasureRunner(w.runnerDeps({ kv })).runOnce();
		assert.equal(w.log.filter((entry) => entry === `unban:${U1}`).length, before + 1);
		assert.equal(JSON.parse(kv.values.get('osb:erasure:unban_pending')).length, 0);
	});

	it('warns and unbans when the erase fails after the request is already gone', async () => {
		const w = createErasureWorld({ users: [U1] });
		w.after.pat_revoke = (user) => w.requests.delete(user);
		w.fail.add('erase');
		await runner(w).runOnce();
		assert.equal(w.log.filter((entry) => entry.startsWith('warn:banned_without_request')).length, 1);
		assert.ok(w.log.includes(`unban:${U1}`));
	});
});
