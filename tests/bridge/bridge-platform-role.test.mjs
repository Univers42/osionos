/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-platform-role.test.mjs                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-4-a: the platform role. The vocabulary (four names, one rank), the read that
// resolves it (an expired grant is no grant), the claim that carries it, and the sign-in
// that mints it (best-effort: a broken role read still signs the user in).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import {
	PLATFORM_ROLES,
	ROLE_RANK,
	isPlatformRole,
	readPlatformRole,
	roleAtLeast,
	roleFromNames,
} from '../../scripts/bridge-roles.mjs';
import {
	configFromEnv,
	consumeHandoffToken,
	createBridgeHandoff,
	signAppSessionToken,
	validateBridgePayload,
	verifyAppSessionToken,
} from '../../scripts/bridge-api.mjs';
import { createPg } from '../../scripts/bridge-pg.mjs';
import { kvStub } from './support/kv-stub.mjs';

const NOW = 1_768_000_000_000;
const SECRET = 'test-app-session-secret-that-is-long-enough';
const SUBJECT = '3f6d2a70-5b3f-4c92-8f06-8f4644fd1209';
const ROLE_USER = '11111111-1111-4111-8111-111111111111';
const ROLE_MODERATOR = '22222222-2222-4222-8222-222222222222';
const ROLE_ADMIN = '33333333-3333-4333-8333-333333333333';
const ROLE_WIZARD = '44444444-4444-4444-8444-444444444444';
const ADMIN_EMAIL = 'boss@example.com';
const PRIVATE_WORKSPACE = 'ac47a462-a784-49cb-aa8d-c87a7251be1e';

function signinConfig(extra = {}) {
	return configFromEnv({
		OSIONOS_APP_URL: 'http://localhost:3001',
		OSIONOS_BRIDGE_SHARED_SECRET: 'test-bridge-secret-that-is-long-enough',
		OSIONOS_APP_SESSION_SECRET: SECRET,
		OSIONOS_BAAS_URL: 'http://baas.local',
		KONG_SERVICE_API_KEY: 'service-role-test-key',
		OSIONOS_BRIDGE_PERSISTENCE: 'memory',
		OSIONOS_ADMIN_EMAILS: ADMIN_EMAIL,
		...extra,
	});
}

/**
 * The role plane as a table-driven PostgREST. It applies the `or=(…)` expiry filter, so an
 * expired grant answers as no grant, and it records every read, so a test can prove which
 * reads happened and in what shape.
 */
function rolePlane({ grants = [], roles = [], broken = false } = {}) {
	const calls = [];
	const answer = (table, params) => {
		if (table === 'user_roles') {
			const userId = String(params.get('user_id') ?? '').replace(/^eq\./, '');
			const floor = /expires_at\.gt\.([^,)]*)/.exec(params.get('or') ?? '')?.[1] ?? '';
			return grants
				.filter((row) => row.user_id === userId)
				.filter((row) => row.expires_at == null || row.expires_at > floor)
				.map((row) => ({ role_id: row.role_id }));
		}
		if (table === 'roles') {
			const ids = String(params.get('id') ?? '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',');
			return roles.filter((row) => ids.includes(row.id)).map((row) => ({ id: row.id, name: row.name }));
		}
		return [];
	};
	const record = (table, params) => {
		calls.push({ table, params });
		if (broken && (table === 'user_roles' || table === 'roles')) throw new Error('the role plane is unreachable');
		return answer(table, params);
	};
	const client = {
		async get(path) {
			const [table, query = ''] = path.split('?');
			return record(table, new URLSearchParams(query));
		},
	};
	const fetchImpl = async (url) => {
		const parsed = new URL(String(url));
		const table = parsed.pathname.replace('/rest/v1/', '');
		const body = record(table, parsed.searchParams);
		return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
	};
	return { client, fetchImpl, calls };
}

function grant(roleId, { userId = SUBJECT, expiresAt = null } = {}) {
	return { user_id: userId, role_id: roleId, expires_at: expiresAt };
}

/** A token signed with the app session secret, for the claims no signer of ours mints. */
function mintRaw(payload) {
	const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const signature = createHmac('sha256', SECRET).update(encoded).digest('base64url');
	return `osionos_v1.${encoded}.${signature}`;
}

function rawPayload(extra = {}) {
	return {
		iss: 'osionos-bridge',
		aud: 'osionos-app',
		sub: SUBJECT,
		provider: 'prismatica',
		workspace_ids: [PRIVATE_WORKSPACE],
		roles: {},
		is_admin: false,
		jti: randomUUID(),
		iat: Math.floor(NOW / 1000),
		exp: Math.floor(NOW / 1000) + 3600,
		...extra,
	};
}

describe('the platform role vocabulary', () => {
	it('names the four roles and ranks them', () => {
		assert.deepEqual(PLATFORM_ROLES, ['admin', 'moderator', 'user', 'guest']);
		assert.deepEqual(ROLE_RANK, { admin: 3, moderator: 2, user: 1, guest: 0 });
	});

	it('knows which names are roles', () => {
		assert.equal(isPlatformRole('moderator'), true);
		assert.equal(isPlatformRole('wizard'), false);
		assert.equal(isPlatformRole(null), false);
		assert.equal(isPlatformRole(undefined), false);
	});

	it('ranks a role against a minimum', () => {
		assert.equal(roleAtLeast('admin', 'moderator'), true);
		assert.equal(roleAtLeast('moderator', 'admin'), false);
		assert.equal(roleAtLeast('guest', 'user'), false);
		assert.equal(roleAtLeast('user', 'user'), true);
		assert.equal(roleAtLeast(null, 'guest'), false);
		assert.equal(roleAtLeast('wizard', 'guest'), false);
		assert.equal(roleAtLeast('admin', 'wizard'), false);
	});

	it('takes the highest-ranked name of a list', () => {
		assert.equal(roleFromNames(['user', 'moderator']), 'moderator');
		assert.equal(roleFromNames(['moderator', 'admin']), 'admin');
		assert.equal(roleFromNames([]), null);
		assert.equal(roleFromNames(null), null);
		assert.equal(roleFromNames(['wizard']), null);
		assert.equal(roleFromNames(['user', 'wizard']), 'user');
	});
});

describe('readPlatformRole', () => {
	it('answers no role for a user without a grant row', async () => {
		const plane = rolePlane({ roles: [{ id: ROLE_USER, name: 'user' }] });
		assert.deepEqual(await readPlatformRole(plane.client, SUBJECT), { role: null, names: [] });
	});

	it('answers the highest-ranked role of the grants', async () => {
		const plane = rolePlane({
			grants: [grant(ROLE_USER), grant(ROLE_MODERATOR)],
			roles: [{ id: ROLE_USER, name: 'user' }, { id: ROLE_MODERATOR, name: 'moderator' }],
		});
		assert.deepEqual(await readPlatformRole(plane.client, SUBJECT), { role: 'moderator', names: ['user', 'moderator'] });
	});

	it('ignores a role name the platform does not know', async () => {
		const plane = rolePlane({
			grants: [grant(ROLE_WIZARD), grant(ROLE_USER)],
			roles: [{ id: ROLE_WIZARD, name: 'wizard' }, { id: ROLE_USER, name: 'user' }],
		});
		assert.deepEqual(await readPlatformRole(plane.client, SUBJECT), { role: 'user', names: ['user'] });
	});

	it('counts an expired grant as no grant', async () => {
		const plane = rolePlane({
			grants: [grant(ROLE_USER), grant(ROLE_MODERATOR, { expiresAt: '2020-01-01T00:00:00.000Z' })],
			roles: [{ id: ROLE_USER, name: 'user' }, { id: ROLE_MODERATOR, name: 'moderator' }],
		});
		assert.deepEqual(await readPlatformRole(plane.client, SUBJECT), { role: 'user', names: ['user'] });
	});

	it('fails closed when the read breaks, and never throws', async () => {
		const plane = rolePlane({ broken: true });
		assert.deepEqual(await readPlatformRole(plane.client, SUBJECT), { role: null, names: [] });
		assert.deepEqual(await readPlatformRole(null, SUBJECT), { role: null, names: [] });
		assert.deepEqual(await readPlatformRole(plane.client, ''), { role: null, names: [] });
	});

	it('reads the grants of that user, then the catalogue by unquoted ids', async () => {
		const plane = rolePlane({
			grants: [grant(ROLE_MODERATOR)],
			roles: [{ id: ROLE_MODERATOR, name: 'moderator' }],
		});
		await readPlatformRole(plane.client, SUBJECT);
		assert.equal(plane.calls.length, 2);
		assert.equal(plane.calls[0].table, 'user_roles');
		assert.equal(plane.calls[0].params.get('user_id'), `eq.${SUBJECT}`);
		assert.equal(plane.calls[1].table, 'roles');
		assert.equal(plane.calls[1].params.get('id'), `in.(${ROLE_MODERATOR})`);
		assert.ok(!String(plane.calls[1].params.get('id')).includes('%28'), 'the ids are not quoted');
	});

	it('asks for the grants that outlive the moment of the read', async () => {
		const plane = rolePlane({ grants: [grant(ROLE_USER)], roles: [{ id: ROLE_USER, name: 'user' }] });
		await readPlatformRole(plane.client, SUBJECT, NOW);
		const filter = plane.calls[0].params.get('or') ?? '';
		assert.match(filter, /^\(expires_at\.is\.null,expires_at\.gt\.[^)]+\)$/);
		const floor = /expires_at\.gt\.([^,)]*)/.exec(filter)?.[1] ?? '';
		assert.equal(floor, new Date(NOW).toISOString());
		assert.ok(Number.isFinite(Date.parse(floor)), `the expiry floor is a readable timestamp: ${floor}`);
	});
});

describe('the session claim', () => {
	const workspace = { _id: PRIVATE_WORKSPACE };

	it('carries the role next to the admin bit', () => {
		const { token } = signAppSessionToken({ payload: { subject: SUBJECT, provider: 'prismatica' }, workspace, config: signinConfig(), platformRole: 'moderator' });
		const claims = verifyAppSessionToken(token, signinConfig(), NOW);
		assert.equal(claims.raw.platform_role, 'moderator');
		assert.equal(claims.platformRole, 'moderator');
		assert.equal(claims.isAdmin, false);
	});

	it('makes the admin bit follow the role', () => {
		const { token } = signAppSessionToken({ payload: { subject: SUBJECT, provider: 'prismatica' }, workspace, config: signinConfig(), platformRole: 'admin' });
		const claims = verifyAppSessionToken(token, signinConfig(), NOW);
		assert.equal(claims.raw.platform_role, 'admin');
		assert.equal(claims.isAdmin, true);
	});

	it('answers no role for a token without the claim', () => {
		const claims = verifyAppSessionToken(mintRaw(rawPayload()), signinConfig(), NOW);
		assert.equal(claims.platformRole, null);
		assert.equal(claims.isAdmin, false);
	});

	it('answers no role for a claim the platform does not know', () => {
		const claims = verifyAppSessionToken(mintRaw(rawPayload({ platform_role: 'wizard' })), signinConfig(), NOW);
		assert.equal(claims.platformRole, null);
		assert.equal(claims.isAdmin, false);
	});
});

describe('the sign-in', () => {
	async function signIn(plane, { email = 'owner@example.com', emailVerified = true } = {}) {
		const config = signinConfig();
		const payload = validateBridgePayload({ provider: 'prismatica', subject: SUBJECT, email, emailVerified, name: 'Owner', jti: randomUUID() });
		const kv = kvStub();
		const pg = createPg({ config, env: {}, fetchImpl: plane.fetchImpl });
		const minted = await createBridgeHandoff({ payload, config, kv, pg, now: NOW, fetchImpl: plane.fetchImpl });
		const token = new URL(minted.redirectUrl).hash.replace('#bridge_token=', '');
		const { session } = await consumeHandoffToken(decodeURIComponent(token), kv, NOW + 1000, config.appSessionSecret);
		return verifyAppSessionToken(session.accessToken, config, NOW + 1000);
	}

	it('claims the moderator role of the signed user', async () => {
		const plane = rolePlane({
			grants: [grant(ROLE_MODERATOR)],
			roles: [{ id: ROLE_MODERATOR, name: 'moderator' }],
		});
		const claims = await signIn(plane);
		assert.equal(claims.raw.platform_role, 'moderator');
		assert.equal(claims.isAdmin, false);
		const read = plane.calls.find((call) => call.table === 'user_roles');
		assert.ok(read, 'the sign-in read the grants');
		assert.equal(read.params.get('user_id'), `eq.${SUBJECT}`);
	});

	it('claims the admin role for an env admin, without reading the catalogue', async () => {
		const plane = rolePlane();
		const claims = await signIn(plane, { email: ADMIN_EMAIL });
		assert.equal(claims.raw.platform_role, 'admin');
		assert.equal(claims.isAdmin, true);
		assert.equal(plane.calls.filter((call) => call.table === 'user_roles').length, 0);
	});

	it('signs the user in even when the role read breaks', async () => {
		const plane = rolePlane({ broken: true });
		const claims = await signIn(plane);
		assert.equal(claims.raw.platform_role, null);
		assert.equal(claims.platformRole, null);
		assert.equal(claims.isAdmin, false);
	});
});

describe('P3-4-a round: timeout, validation, warnings, reconciliation', () => {
	it('C3: a non-UUID subject answers no role and records no call', async () => {
		const plane = rolePlane({ grants: [grant(ROLE_USER)], roles: [{ id: ROLE_USER, name: 'user' }] });
		assert.deepEqual(await readPlatformRole(plane.client, 'not-a-uuid'), { role: null, names: [] });
		assert.equal(plane.calls.length, 0);
	});

	it('C4: a throwing client produces one warning and still returns no role', async () => {
		const warnings = [];
		const original = console.warn;
		console.warn = (line) => warnings.push(line);
		let result;
		try {
			const client = { async get() { throw new Error('boom'); } };
			result = await readPlatformRole(client, SUBJECT);
		} finally {
			console.warn = original;
		}
		assert.deepEqual(result, { role: null, names: [] });
		assert.equal(warnings.length, 1);
		assert.match(String(warnings[0]), /user_roles/);
		assert.match(String(warnings[0]), new RegExp(SUBJECT));
	});

	it('C1: a hung read times out to no role without throwing', async () => {
		const warnings = [];
		const original = console.warn;
		console.warn = (line) => warnings.push(line);
		try {
			const client = { get() { return new Promise(() => {}); } };
			assert.deepEqual(await readPlatformRole(client, SUBJECT, Date.now(), 20), { role: null, names: [] });
		} finally {
			console.warn = original;
		}
		assert.equal(warnings.length, 1);
	});

	it('C1: the catalogue read is bounded too', async () => {
		const original = console.warn;
		console.warn = () => {};
		try {
			let n = 0;
			const client = { get() { return ++n === 1 ? Promise.resolve([grant(ROLE_USER)]) : new Promise(() => {}); } };
			assert.deepEqual(await readPlatformRole(client, SUBJECT, Date.now(), 20), { role: null, names: [] });
			assert.equal(n, 2);
		} finally {
			console.warn = original;
		}
	});

	it('C2: a valid non-admin platform_role forces isAdmin false on verify', () => {
		const claims = verifyAppSessionToken(mintRaw(rawPayload({ platform_role: 'user', is_admin: true })), signinConfig(), NOW);
		assert.equal(claims.platformRole, 'user');
		assert.equal(claims.isAdmin, false);
	});
});

describe('P3-4-a round: sign-in with a hung role read', () => {
	it('C1: sign-in still completes when the role read never resolves', async () => {
		const config = signinConfig();
		const hang = new Promise(() => {});
		const fetchImpl = async (url) => {
			const table = new URL(String(url)).pathname.replace('/rest/v1/', '');
			if (table === 'user_roles' || table === 'roles') return hang;
			return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
		};
		const payload = validateBridgePayload({ provider: 'prismatica', subject: SUBJECT, email: 'owner@example.com', emailVerified: true, name: 'Owner', jti: randomUUID() });
		const kv = kvStub();
		const pg = createPg({ config, env: {}, fetchImpl });
		const original = console.warn;
		console.warn = () => {};
		try {
			const minted = await createBridgeHandoff({ payload, config, kv, pg, now: NOW, fetchImpl });
			const token = new URL(minted.redirectUrl).hash.replace('#bridge_token=', '');
			const { session } = await consumeHandoffToken(decodeURIComponent(token), kv, NOW + 1000, config.appSessionSecret);
			const claims = verifyAppSessionToken(session.accessToken, config, NOW + 1000);
			assert.equal(claims.platformRole, null);
			assert.equal(claims.isAdmin, false);
		} finally {
			console.warn = original;
		}
	});
});

describe('P3-4-a round: raw admin bit follows the signed role', () => {
	const workspace = { _id: PRIVATE_WORKSPACE };
	it('minted is_admin is true only for the admin role', () => {
		const { token: adminToken } = signAppSessionToken({ payload: { subject: SUBJECT, provider: 'prismatica' }, workspace, config: signinConfig(), platformRole: 'admin' });
		const { token: modToken } = signAppSessionToken({ payload: { subject: SUBJECT, provider: 'prismatica' }, workspace, config: signinConfig(), platformRole: 'moderator' });
		assert.equal(verifyAppSessionToken(adminToken, signinConfig(), NOW).raw.is_admin, true);
		assert.equal(verifyAppSessionToken(modToken, signinConfig(), NOW).raw.is_admin, false);
	});
});
