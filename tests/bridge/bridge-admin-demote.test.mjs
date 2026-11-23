// osionos#343: an admin demotes another admin. Until now the only demotion was an operator's SQL on
// osionos_bridge_identities.is_admin, and the console refused the grant of a flagged account
// (409 admin_flag_set). Ruling D343-1..15: refusals before any write, flag → grant → membership →
// cut-off, 503 demote_incomplete on a partial run, and a read-back before the 200.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { USER_A, USER_B } from './support/account-world.mjs';
import { tokenFor } from './support/admin-route-world.mjs';
import {
	AUDIT, CUTOFFS, ENV_ADMIN, IDENTITIES, MEMBERS, OTHER_WORKSPACE, USER_C,
	adminGrants, adminMembership, demoteTables, flagged, startDemoteWorld,
} from './support/demote-world.mjs';
import { ROLE_IDS } from './support/admin-route-world.mjs';

const writeIndex = (store, table, method) => store.calls.findIndex((call) => call.table === table && call.method === method);
const LOCK = 'osb:admin-demote';

function assertNothingWritten(world, answer) {
	assert.deepEqual(world.writes().map((call) => `${call.method} ${call.table}`), [], `no write for ${answer.status} ${answer.body?.code}`);
	assert.equal(flagged(world.store, USER_B).length, 3);
	assert.equal(world.kv.values.has(LOCK), false, 'the lock is not left behind');
}

describe('POST /api/account/admin/users/:userId/demote — the happy path', () => {
	it('clears every flagged row, the grants, the admin membership, and signs the target out', async (t) => {
		const world = await startDemoteWorld(t);
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 200, answer.text);
		assert.deepEqual(answer.body, { ok: true });
		const { store } = world;
		assert.deepEqual(flagged(store, USER_B), [], 'both keys cleared (user_id and subject)');
		assert.equal(flagged(store, USER_A).length, 1, 'the caller keeps the flag');
		assert.deepEqual(adminGrants(store, USER_B), [], 'the live and the expired admin grant are gone');
		assert.ok(store.rows('user_roles').some((row) => row.user_id === USER_B && row.role_id === ROLE_IDS.user), 'the user grant stays');
		assert.deepEqual(adminMembership(store, USER_B), []);
		assert.ok(store.rows(MEMBERS).some((row) => row.user_id === USER_B && row.workspace_id === OTHER_WORKSPACE), 'other memberships stay');
		assert.deepEqual(store.rows(CUTOFFS).map((row) => row.user_id), [USER_B]);
		assert.equal(world.kv.values.has(LOCK), false, 'the lock is released');
	});

	it('records the audit row before the first write, with the target id and the action only', async (t) => {
		const world = await startDemoteWorld(t);
		assert.equal((await world.demote(USER_B)).status, 200);
		const audit = writeIndex(world.store, AUDIT, 'POST');
		const patch = writeIndex(world.store, IDENTITIES, 'PATCH');
		assert.ok(audit >= 0 && audit < patch, 'audit, then the flag');
		assert.ok(patch < writeIndex(world.store, 'user_roles', 'DELETE'));
		assert.ok(writeIndex(world.store, 'user_roles', 'DELETE') < writeIndex(world.store, MEMBERS, 'DELETE'));
		assert.ok(writeIndex(world.store, MEMBERS, 'DELETE') < writeIndex(world.store, CUTOFFS, 'POST'));
		const [row] = world.store.rows(AUDIT);
		assert.equal(row.event_type, 'admin_role_change');
		assert.deepEqual(row.details, { targetUserId: USER_B, action: 'demote' });
	});

	it('runs idempotently for an account that holds no admin (D343-3): 200, never 500', async (t) => {
		const world = await startDemoteWorld(t);
		const answer = await world.demote(USER_C);
		assert.equal(answer.status, 200, answer.text);
		assert.deepEqual(world.store.rows(CUTOFFS).map((row) => row.user_id), [USER_C]);
	});
});

describe('refusals, in the D343-2 order, each before any audit row or write', () => {
	it('a malformed id: 422 invalid_user_id', async (t) => {
		const world = await startDemoteWorld(t);
		const answer = await world.demote('not-a-uuid');
		assert.equal(answer.status, 422);
		assert.equal(answer.body.code, 'invalid_user_id');
		assertNothingWritten(world, answer);
	});

	it('the caller themselves: 409 self_demotion', async (t) => {
		const world = await startDemoteWorld(t);
		const answer = await world.demote(USER_A);
		assert.equal(answer.status, 409);
		assert.equal(answer.body.code, 'self_demotion');
		assertNothingWritten(world, answer);
	});

	it('no sudo grant on the session: 403 sudo_required', async (t) => {
		const world = await startDemoteWorld(t);
		const answer = await world.demote(USER_B, tokenFor(world.config, USER_A, true));
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'sudo_required');
		assertNothingWritten(world, answer);
	});

	it('a caller whose admin is only a user_roles grant (no identity flag): 403', async (t) => {
		const tables = demoteTables();
		tables[IDENTITIES][0].is_admin = false;
		const world = await startDemoteWorld(t, { tables });
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'admin_required');
		assertNothingWritten(world, answer);
	});

	it('a target whose primary address is env-listed, in any case: 409 admin_email_listed, and the address is not echoed', async (t) => {
		const world = await startDemoteWorld(t);
		world.directory.set(USER_B, { email: ENV_ADMIN.toUpperCase() });
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 409);
		assert.equal(answer.body.code, 'admin_email_listed');
		assert.match(answer.body.message, /OSIONOS_ADMIN_EMAILS/);
		assert.doesNotMatch(answer.text, /example\.test/i);
		assertNothingWritten(world, answer);
	});

	it('a target with an env-listed VERIFIED secondary address: 409 admin_email_listed', async (t) => {
		const world = await startDemoteWorld(t);
		await world.addSecondary(USER_B, ENV_ADMIN);
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 409);
		assert.equal(answer.body.code, 'admin_email_listed');
		assert.doesNotMatch(answer.text, /example\.test/i);
		assertNothingWritten(world, answer);
	});

	it('an env-listed address that is still pending (unverified) does not block the demotion', async (t) => {
		const world = await startDemoteWorld(t);
		await world.addSecondary(USER_B, ENV_ADMIN, null);
		assert.equal((await world.demote(USER_B)).status, 200);
	});

	it('a verified secondary that does not open: 503, nothing written (fail closed)', async (t) => {
		const world = await startDemoteWorld(t);
		await world.addSecondary(USER_B, 'second@example.test');
		world.store.rows('osionos_user_emails')[0].email_hmac = 'f'.repeat(64);
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 503);
		assertNothingWritten(world, answer);
	});

	it('GoTrue cannot be read: 503, nothing written; an unknown account: 404 user_not_found', async (t) => {
		const world = await startDemoteWorld(t);
		world.directory.set(USER_B, { status: 502 });
		const failed = await world.demote(USER_B);
		assert.equal(failed.status, 503);
		assertNothingWritten(world, failed);
		world.directory.delete(USER_B);
		const unknown = await world.demote(USER_B);
		assert.equal(unknown.status, 404);
		assert.equal(unknown.body.code, 'user_not_found');
		assertNothingWritten(world, unknown);
	});

	it('the lock is held by another demotion: 409 demote_busy', async (t) => {
		const world = await startDemoteWorld(t);
		await world.kv.setNx('admin-demote', 'someone-else', 60_000);
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 409);
		assert.equal(answer.body.code, 'demote_busy');
		assert.deepEqual(world.writes(), []);
		assert.equal(world.kv.values.get(LOCK), 'someone-else', 'the other run keeps its lock');
	});

	it('the caller lost the flag between the gate and the lock: 403, re-read inside the lock', async (t) => {
		let gotrueReads = 0;
		const world = await startDemoteWorld(t, {
			wrap: (next) => async (url, init) => {
				if (String(url).includes('/auth/v1/')) gotrueReads += 1;
				const answer = await next(url, init);
				if (String(url).includes('/auth/v1/')) world.store.rows(IDENTITIES)[0].is_admin = false;
				return answer;
			},
		});
		const answer = await world.demote(USER_B);
		assert.equal(gotrueReads, 1);
		assert.equal(answer.status, 403);
		assert.equal(answer.body.code, 'admin_required');
		assertNothingWritten(world, answer);
	});

	it('a stalled run whose caller lost the flag after the lock check: 403 before the clear, no write after the audit row', async (t) => {
		let world;
		world = await startDemoteWorld(t, {
			wrap: (next) => async (url, init) => {
				const answer = await next(url, init);
				if (init?.method === 'POST' && String(url).includes(`/${AUDIT}`)) world.store.rows(IDENTITIES)[0].is_admin = false;
				return answer;
			},
		});
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 403, answer.text);
		assert.equal(answer.body.code, 'admin_required');
		assert.deepEqual(world.writes().map((call) => `${call.method} ${call.table}`), [`POST ${AUDIT}`]);
		assert.equal(flagged(world.store, USER_B).length, 3);
		assert.equal(adminGrants(world.store, USER_B).length, 2);
		assert.equal(world.kv.values.has(LOCK), false, 'the lock is released');
	});

	it('a flag read that fails, at the gate or inside the lock: 503, nothing written', async (t) => {
		let reads = 0;
		const world = await startDemoteWorld(t, { failReads: (table) => table === IDENTITIES && ++reads >= 2 });
		const answer = await world.demote(USER_B);
		assert.equal(reads, 2, 'the gate read passed, the re-read inside the lock failed');
		assert.equal(answer.status, 503);
		assertNothingWritten(world, answer);
		const gate = await startDemoteWorld(t, { failReads: (table) => table === IDENTITIES });
		const refused = await gate.demote(USER_B);
		assert.equal(refused.status, 503);
		assertNothingWritten(gate, refused);
	});

	it('the audit row cannot be written: 503 audit_unavailable, nothing else is written', async (t) => {
		const world = await startDemoteWorld(t, { refuse: [AUDIT] });
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 503);
		assert.equal(answer.body.code, 'audit_unavailable');
		assert.deepEqual(world.writes().map((call) => call.table), [AUDIT]);
		assert.equal(flagged(world.store, USER_B).length, 3);
	});
});

describe('a partial run answers 503 demote_incomplete and a retry completes it (D343-8, D343-9)', () => {
	it('the grant delete fails: flag cleared, grant kept, 503; the retry answers 200 and the grant is gone', async (t) => {
		const refuse = ['user_roles'];
		const world = await startDemoteWorld(t, { refuse });
		const first = await world.demote(USER_B);
		assert.equal(first.status, 503, first.text);
		assert.equal(first.body.code, 'demote_incomplete');
		assert.deepEqual(first.body.landed, ['flag', 'membership', 'sessions']);
		assert.deepEqual(flagged(world.store, USER_B), [], 'the flag is never re-set');
		assert.equal(adminGrants(world.store, USER_B).length, 2);
		assert.equal(world.kv.values.has(LOCK), false);
		refuse.length = 0;
		const retry = await world.demote(USER_B);
		assert.equal(retry.status, 200, retry.text);
		assert.deepEqual(adminGrants(world.store, USER_B), []);
	});

	it('the flag clear fails: 503, and no later step runs', async (t) => {
		const world = await startDemoteWorld(t, { refuse: [IDENTITIES] });
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 503);
		assert.equal(answer.body.code, 'demote_incomplete');
		assert.deepEqual(answer.body.landed, []);
		assert.deepEqual(world.writes().map((call) => call.table), [AUDIT, IDENTITIES]);
		assert.equal(adminGrants(world.store, USER_B).length, 2);
	});

	it('the read-back finds a grant written back after the delete: 503, never a 200 over a leftover', async (t) => {
		let world;
		world = await startDemoteWorld(t, {
			wrap: (next) => async (url, init) => {
				const answer = await next(url, init);
				if (init?.method === 'DELETE' && String(url).includes('/user_roles?')) {
					world.store.rows('user_roles').push({ user_id: USER_B, role_id: ROLE_IDS.admin, expires_at: null });
				}
				return answer;
			},
		});
		const answer = await world.demote(USER_B);
		assert.equal(answer.status, 503, answer.text);
		assert.equal(answer.body.code, 'demote_incomplete');
		assert.doesNotMatch(answer.text, /example\.test/i);
	});
});
