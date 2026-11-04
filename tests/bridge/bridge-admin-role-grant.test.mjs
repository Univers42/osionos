// The users console re-reads `public.user_roles` (bridge-account-users.mjs), while the sign-in claim
// names an admin from the identity flag (ADR 0005). With no grant row, the flag's admin was refused
// by the console: production, 2026-11-04, osionos#296. Sign-in now writes the grant the flag implies.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUBJECT, PRIVATE_ID, createSigninStub, hashOf, signIn } from './support/signin-world.mjs';

const ADMIN_ROLE = '249a2bd5-10a1-44ee-a17b-940088057e61';
const USER_ROLE = '789051ce-aaae-4543-958e-59d14a3c8db5';
const roles = [{ id: ADMIN_ROLE, name: 'admin' }, { id: USER_ROLE, name: 'user' }];
const adminGrants = (stub) => stub.mock.rows('user_roles').filter((row) => row.user_id === SUBJECT && row.role_id === ADMIN_ROLE);

describe('sign-in writes the admin grant the identity flag implies', () => {
	it('an env-named admin with only a user grant gets the admin grant', async () => {
		const stub = createSigninStub({ roles, user_roles: [{ user_id: SUBJECT, role_id: USER_ROLE, expires_at: null }] });
		const { claims } = await signIn(stub, { email: 'boss@example.com' });
		assert.equal(claims.isAdmin, true);
		assert.equal(adminGrants(stub).length, 1);
	});

	it('a DB-recorded admin signing in twice keeps one grant, and an expired one is renewed', async () => {
		const dbAdmin = { provider: 'prismatica', subject: SUBJECT, email_hash: hashOf('owner@example.com'), is_admin: true, workspace_id: PRIVATE_ID };
		const stub = createSigninStub({ identities: [dbAdmin], roles, user_roles: [{ user_id: SUBJECT, role_id: ADMIN_ROLE, expires_at: '2020-01-01T00:00:00.000Z' }] });
		await signIn(stub);
		await signIn(stub);
		assert.deepEqual(adminGrants(stub).map((row) => row.expires_at), [null]);
	});

	it('an ordinary user gets no grant', async () => {
		const stub = createSigninStub({ roles });
		const { claims } = await signIn(stub);
		assert.equal(claims.isAdmin, false);
		assert.equal(adminGrants(stub).length, 0);
	});

	it('a failing grant write never fails the sign-in', async () => {
		const stub = createSigninStub({ roles }, { fail: (entry) => (entry.name === 'user_roles' ? new Response('down', { status: 503 }) : null) });
		const { claims } = await signIn(stub, { email: 'boss@example.com' });
		assert.equal(claims.isAdmin, true);
	});
});
