// The users console re-reads `public.user_roles` (bridge-account-users.mjs), while the sign-in claim
// names an admin from the identity flag (ADR 0005). With no grant row, the flag's admin was refused
// by the console: production, 2026-11-04, osionos#296. Sign-in now writes the grant the flag implies.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUBJECT, PRIVATE_ID, createSigninStub, hashOf, signIn, signinConfig } from './support/signin-world.mjs';
import { readRefreshClaims } from '../../scripts/bridge-api.mjs';
import { noFactorPg } from './support/no-factor-pg.mjs';
import { startSessionBridge } from './support/session-world.mjs';
import { refreshWith, signIn as signInOverHttp, tokenClaims } from './support/session-signin.mjs';

const ADMIN_ROLE = '249a2bd5-10a1-44ee-a17b-940088057e61';
const USER_ROLE = '789051ce-aaae-4543-958e-59d14a3c8db5';
const roles = [{ id: ADMIN_ROLE, name: 'admin' }, { id: USER_ROLE, name: 'user' }];
const pick = ({ is_admin, platform_role }) => ({ is_admin, platform_role });
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

// osionos#296 follow-up (RULING-296 A296-5): a refresh re-reads the flag, so it re-writes the grant
// too. (b) pins that a revoked row of a flagged account comes back within one refresh, on purpose.
describe('a refresh writes the admin grant the identity flag implies', () => {
	const identityRow = (isAdmin) => ({ provider: 'prismatica', subject: SUBJECT, email_hash: hashOf('owner@example.com'), is_admin: isAdmin, workspace_id: PRIVATE_ID });
	const tokenIdentity = { sub: SUBJECT, provider: 'prismatica', email: 'owner@example.com', workspace_ids: [PRIVATE_ID] };
	const refresh = (stub) => readRefreshClaims(tokenIdentity, { config: signinConfig(), pg: noFactorPg(), fetchImpl: stub.fetchImpl });
	const grantWrites = (stub) => stub.log.filter((entry) => entry.name.startsWith('user_roles') && entry.method === 'POST');

	it('(a) a flagged account with no grant gets it back', async () => {
		const stub = createSigninStub({ identities: [identityRow(true)], roles });
		const claims = await refresh(stub);
		assert.equal(claims.isAdmin, true);
		assert.equal(adminGrants(stub).length, 1);
	});

	it('(b) a grant revoked after sign-in is restored by the next refresh', async () => {
		const stub = createSigninStub({ identities: [identityRow(true)], roles });
		await signIn(stub);
		const grants = stub.mock.rows('user_roles');
		grants.splice(0, grants.length);
		await refresh(stub);
		assert.equal(adminGrants(stub).length, 1);
	});

	it('(c) an account without the flag gets no grant', async () => {
		const stub = createSigninStub({ identities: [identityRow(false)], roles });
		const claims = await refresh(stub);
		assert.equal(claims.isAdmin, false);
		assert.equal(grantWrites(stub).length, 0);
	});

	it('(d) a flag read that fails writes nothing', async () => {
		const down = (entry) => (entry.name === 'osionos_bridge_identities' ? new Response('down', { status: 503 }) : null);
		const stub = createSigninStub({ identities: [identityRow(true)], roles }, { fail: down });
		const claims = await refresh(stub);
		assert.equal(claims.isAdmin, false);
		assert.equal(grantWrites(stub).length, 0);
	});

	it('(e) a grant write that rejects still answers the admin claims', async () => {
		const hold = (entry) => (entry.name.startsWith('user_roles') ? Promise.reject(new Error('link down')) : undefined);
		const stub = createSigninStub({ identities: [identityRow(true)], roles }, { hold });
		const { isAdmin, platformRole } = await refresh(stub);
		assert.deepEqual({ isAdmin, platformRole }, { isAdmin: true, platformRole: 'admin' });
		assert.equal(grantWrites(stub).length, 1);
	});

	it('(e) the refresh route answers 200 with the admin claims when the grant write rejects', async (t) => {
		const fail = (call) => {
			if (call.table === 'user_roles' && call.method === 'POST') throw new Error('link down');
			if (call.table === 'osionos_bridge_identities' && call.method === 'GET') return { status: 200, body: [{ is_admin: true }] };
			if (call.table === 'roles') return { status: 200, body: [{ id: ADMIN_ROLE }] };
			return null;
		};
		const { base, store } = await startSessionBridge({ t, fail });
		const first = await signInOverHttp(base);
		const writesBefore = store.callsTo('user_roles').filter((call) => call.method === 'POST').length;
		const rotated = await refreshWith(base, first.refreshToken);
		assert.equal(rotated.status, 200);
		assert.deepEqual(pick(tokenClaims(rotated.body.accessToken)), { is_admin: true, platform_role: 'admin' });
		assert.equal(store.callsTo('user_roles').filter((call) => call.method === 'POST').length, writesBefore + 1);
	});
});
