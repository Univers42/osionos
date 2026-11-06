// The resume mint (devil verdict 2026-11-01, Amendment 1, R2, R8): no step-up, but one fresh
// identity check per mint, the same check the token spends, and only for the caller's live row.
// Removing the machine stops it, which is how a remembered computer is revoked.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bridgeKeyFromSeed, verifyMachineToken, verifyResumeAssertion } from '../../scripts/ide-machine-protocol.mjs';
import { IDE_ORIGIN, SEED, USER_A, USER_B, call, onlineMachine, pairThrough, startMachineWorld } from './support/machines-world.mjs';

const CURRENT = bridgeKeyFromSeed(SEED);
const KEYS = { [CURRENT.kid]: CURRENT.publicKey };
const NONCE = 'n0nce-n0nce-n0nce-n0nce';

async function checked(world, { user = USER_A } = {}) {
	const online = await onlineMachine(world, { user });
	const check = (token = world.plain(user)) => call(world.base, `/api/machines/${online.id}/identity`, { token, body: online.machine.whoamiBody(online.id, NONCE) });
	return { ...online, check, resume: (token = world.plain(user)) => call(world.base, `/api/machines/${online.id}/resume`, { token }) };
}

describe('POST /api/machines/:id/resume', () => {
	it('R2: mints a 60 s resume assertion with no step-up once the identity is checked', async (t) => {
		const world = await startMachineWorld(t);
		const { id, check, resume } = await checked(world);
		assert.equal((await check()).status, 200);
		const answer = await resume();
		assert.equal(answer.status, 200, JSON.stringify(answer.body));
		const claims = verifyResumeAssertion(answer.body.assertion, { keys: KEYS, machine: id, aud: IDE_ORIGIN, now: world.clock.at });
		assert.equal(claims.sub, USER_A);
		assert.equal(claims.typ, 'resume');
		assert.ok(claims.exp - claims.iat <= 60);
		assert.equal(answer.body.exp, claims.exp);
		assert.equal(answer.body.token, undefined, 'never a machine token');
	});

	it('R2: one identity check buys one mint, shared with the token: 428 before, 200 once, 428 after', async (t) => {
		const world = await startMachineWorld(t);
		const { id, token, check, resume } = await checked(world);
		assert.equal((await resume()).body.code, 'identity_required');
		await check();
		assert.equal((await resume()).status, 200);
		assert.equal((await resume()).status, 428);
		assert.equal((await call(world.base, `/api/machines/${id}/token`, { token })).status, 428, 'the resume spent the check');
	});

	it('R2, R8: a removed machine, a revoked row and another account\'s machine are refused', async (t) => {
		const world = await startMachineWorld(t);
		const { id, token, check, resume } = await checked(world);
		await check();
		assert.equal((await call(world.base, `/api/machines/${id}`, { method: 'DELETE', token })).status, 204);
		const removed = await resume();
		assert.equal(removed.status, 403);
		assert.equal(removed.body.code, 'not_allowed');
		const foreign = await resume(world.plain(USER_B));
		assert.equal(foreign.status, 403, 'another account');
		assert.equal((await call(world.base, '/api/machines/m-aaaaaaaaaaaaaaaa/resume', { token: world.plain() })).status, 404);
	});

	it('answers 409 offline without presence, and 405 to anything but POST', async (t) => {
		const world = await startMachineWorld(t);
		const { id, token } = await pairThrough(world);
		assert.equal((await call(world.base, `/api/machines/${id}/resume`, { token })).status, 409);
		assert.equal((await call(world.base, `/api/machines/${id}/resume`, { method: 'GET', token })).status, 405);
	});
});

describe('POST /api/machines/:id/token with the remember choice (R6)', () => {
	it('signs remember only when the body says true', async (t) => {
		const world = await startMachineWorld(t);
		const { id, token, check } = await checked(world);
		const mint = async (body) => {
			await check(token);
			const answer = await call(world.base, `/api/machines/${id}/token`, { token, body });
			assert.equal(answer.status, 200);
			return verifyMachineToken(answer.body.token, { keys: KEYS, machine: id, aud: IDE_ORIGIN, now: world.clock.at });
		};
		assert.equal((await mint({ remember: true })).remember, true);
		for (const body of [undefined, {}, { remember: false }, { remember: 'true' }]) {
			assert.equal(Object.hasOwn(await mint(body), 'remember'), false, JSON.stringify(body));
		}
	});
});
