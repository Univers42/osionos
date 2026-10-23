import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { Pool } from 'pg';
import { serveAi, tokenFor } from './serveAi.ts';

/**
 * The switch of AI sentiment (M6): C138. The permission is read from the
 * LIVE osionos_workspace_members row, never from the claims of the token.
 */

const db = new Pool({ connectionString: process.env.OSIONOS_AI_DATABASE_URL ?? '', max: 4 });
const present = await db.query("select to_regclass('public.ai_sentiment_settings') as settings");
const migrated = Boolean(present.rows[0]?.settings);

const base = await serveAi();

const WS = randomUUID();
const OWNER = randomUUID();
const ADMIN = randomUUID();
const VIEWER = randomUUID();
const STRANGER = randomUUID();
const path = (workspaceId: string = WS) => `/api/ai/workspaces/${workspaceId}/sentiment/settings`;

async function call(method: string, token: string, body?: unknown, workspaceId: string = WS): Promise<{ status: number; body: Record<string, unknown> | null }> {
	const response = await fetch(`${base}${path(workspaceId)}`, {
		method,
		headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
}

const stored = async () =>
	(await db.query('select enabled, updated_by from public.ai_sentiment_settings where workspace_id = $1', [WS])).rows[0];

after(async () => {
	if (migrated) {
		await db.query('delete from public.ai_sentiment_settings where workspace_id = $1', [WS]);
		await db.query('delete from public.osionos_workspace_members where workspace_id = $1', [WS]);
	}
	await db.end();
});

describe('the sentiment settings route', { timeout: 60_000, skip: migrated ? false : 'the sentiment migration was not applied' }, () => {
	before(async () => {
		await db.query(
			`insert into public.osionos_workspace_members (workspace_id, user_id, role, permissions) values
			 ($1, $2, 'owner', array['read']), ($1, $3, 'admin', array['read']), ($1, $4, 'viewer', array['read'])`,
			[WS, OWNER, ADMIN, VIEWER],
		);
	});

	it('C138 a member without admin reads (200, off by default) and cannot switch (403); an owner or admin can (200, row written); a non-member gets 404', async () => {
		assert.deepEqual((await call('GET', tokenFor(VIEWER, randomUUID()))).body, { enabled: false });

		const viewerPut = await call('PUT', tokenFor(VIEWER, randomUUID()), { enabled: true });
		assert.equal(viewerPut.status, 403);
		assert.equal(await stored(), undefined);

		const adminPut = await call('PUT', tokenFor(ADMIN, randomUUID()), { enabled: true });
		assert.equal(adminPut.status, 200);
		assert.deepEqual(adminPut.body, { enabled: true });
		assert.deepEqual(await stored(), { enabled: true, updated_by: ADMIN });
		assert.deepEqual((await call('GET', tokenFor(VIEWER, randomUUID()))).body, { enabled: true });

		const ownerPut = await call('PUT', tokenFor(OWNER, randomUUID()), { enabled: false });
		assert.equal(ownerPut.status, 200);
		assert.deepEqual(await stored(), { enabled: false, updated_by: OWNER });

		assert.equal((await call('GET', tokenFor(STRANGER, randomUUID()))).status, 404);
		assert.equal((await call('PUT', tokenFor(STRANGER, randomUUID()), { enabled: true })).status, 404);
		assert.equal((await stored())?.enabled, false);
	});

	it('C138 live: a token that claims the workspace without a members row never gets 200', async () => {
		for (const method of ['GET', 'PUT']) {
			const answer = await call(method, tokenFor(STRANGER, WS), method === 'PUT' ? { enabled: true } : undefined);
			assert.ok(answer.status === 404 || answer.status === 403, `${method} answered ${answer.status}`);
		}
		assert.equal((await stored())?.enabled, false);
	});

	it('C138 a bad body is 400 and a bad workspace id is 400', async () => {
		const token = tokenFor(ADMIN, randomUUID());
		for (const body of [{ enabled: 'yes' }, {}, { enabled: true, extra: 1 }, [true]]) {
			assert.equal((await call('PUT', token, body)).status, 400);
		}
		assert.equal((await call('GET', token, undefined, 'not-a-uuid')).status, 400);
	});
});
