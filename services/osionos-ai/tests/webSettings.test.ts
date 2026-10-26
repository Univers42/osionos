import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { Pool } from 'pg';
import { signAppSessionToken } from '../../../scripts/bridge-session-token.mjs';
import { serveAi, tokenFor } from './serveAi.ts';

/**
 * The switch "Allow web access" (C370, C357): read by any live member, flipped
 * only by an owner or admin from a fresh session, with the disclosure
 * acknowledged; one audit row per real flip.
 */
process.env.OSIONOS_AI_WEB = 'on';

const db = new Pool({ connectionString: process.env.OSIONOS_AI_DATABASE_URL ?? '', max: 4 });
const present = await db.query("select to_regclass('public.ai_workspace_web_settings') as settings");
const migrated = Boolean(present.rows[0]?.settings);

const base = await serveAi();

const WS = randomUUID();
const OWNER = randomUUID();
const ADMIN = randomUUID();
const VIEWER = randomUUID();
const STRANGER = randomUUID();

/** A session older than the ten-minute window. */
const staleTokenFor = (user: string) =>
	signAppSessionToken({
		payload: { subject: user, provider: 'test' },
		workspace: { _id: randomUUID() },
		config: { appSessionSecret: process.env.OSIONOS_APP_SESSION_SECRET ?? '', sessionTtlSeconds: 3600 },
		now: Date.now() - 11 * 60 * 1000,
	}).token;

async function call(method: string, token: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> | null }> {
	const response = await fetch(`${base}/api/ai/workspaces/${WS}/web/settings`, {
		method,
		headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

const audit = async () =>
	(await db.query('select actor_id, web_enabled from public.ai_web_switch_audit where workspace_id = $1 order by id', [WS])).rows;

after(async () => {
	if (migrated) {
		await db.query('delete from public.ai_workspace_web_settings where workspace_id = $1', [WS]);
		await db.query('delete from public.osionos_workspace_members where workspace_id = $1', [WS]);
	}
	await db.end();
});

describe('the web switch route', { timeout: 60_000, skip: migrated ? false : 'the web migration was not applied' }, () => {
	before(async () => {
		await db.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values
			 ($1, $2, 'owner', array['read']), ($1, $3, 'admin', array['read']), ($1, $4, 'viewer', array['read'])`,
			[WS, OWNER, ADMIN, VIEWER],
		);
	});

	it('C370 a member reads off by default and cannot flip it; a non-member gets 404', async () => {
		assert.deepEqual((await call('GET', tokenFor(VIEWER))).body, { enabled: false });
		assert.equal((await call('PUT', tokenFor(VIEWER), { enabled: true, acknowledged: true })).status, 403);
		assert.equal((await call('GET', tokenFor(STRANGER))).status, 404);
		assert.equal((await call('PUT', tokenFor(STRANGER), { enabled: true, acknowledged: true })).status, 404);
		assert.deepEqual(await audit(), []);
	});

	it('C357 a flip without the acknowledged disclosure is refused', async () => {
		assert.equal((await call('PUT', tokenFor(ADMIN), { enabled: true })).status, 400);
		assert.equal((await call('PUT', tokenFor(ADMIN), { enabled: true, acknowledged: false })).status, 400);
		assert.deepEqual(await audit(), []);
	});

	it('C370 a stale session cannot flip it, even an owner', async () => {
		const stale = await call('PUT', staleTokenFor(OWNER), { enabled: true, acknowledged: true });
		assert.equal(stale.status, 403);
		assert.deepEqual(stale.body?.error, { code: 'reauth_required' });
		assert.deepEqual(await audit(), []);
	});

	it('C370 an admin and an owner flip it; each real flip is one audit row, a repeat is none', async () => {
		assert.deepEqual((await call('PUT', tokenFor(ADMIN), { enabled: true, acknowledged: true })).body, { enabled: true });
		assert.deepEqual((await call('GET', tokenFor(VIEWER))).body, { enabled: true });
		assert.equal((await call('PUT', tokenFor(ADMIN), { enabled: true, acknowledged: true })).status, 200);
		assert.equal((await call('PUT', tokenFor(OWNER), { enabled: false, acknowledged: true })).status, 200);
		assert.deepEqual(await audit(), [
			{ actor_id: ADMIN, web_enabled: true },
			{ actor_id: OWNER, web_enabled: false },
		]);
		const row = (await db.query('select web_enabled, updated_by from public.ai_workspace_web_settings where workspace_id = $1', [WS])).rows[0];
		assert.deepEqual(row, { web_enabled: false, updated_by: OWNER });
	});
});
