/**
 * Page trust (AM3): a page is trusted only when it, and every ancestor, sits in
 * the caller's private workspace, is the caller's own, is not shared, has no
 * collaborator, and the workspace has no other member and no edit or comment
 * rule. Each untrusted branch has one fixture and returns its id.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';
import { startHarness, USER_A, USER_B, WORKSPACE_A, WORKSPACE_B } from './harness.ts';
import type { AuthUser } from '../src/auth.ts';

const { app, mock, bridge } = await startHarness();
const { untrustedPageIds } = await import('../src/provenance/trust.ts');

after(async () => {
	await app.close();
	await mock.close();
	await bridge.close();
});

const user: AuthUser = { userId: USER_A, workspaceId: WORKSPACE_A, memberWorkspaces: [], isAdmin: false, issuedAtMs: Date.now(), expiresAtMs: null };

interface PageSpec { workspaceId?: string; ownerId?: string; visibility?: string; collaborators?: unknown[]; parentId?: string | null }

async function page(spec: PageSpec = {}): Promise<string> {
	const id = randomUUID();
	await app.db.query(
		`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, collaborators, parent_page_id, content)
		 values ($1, $2, $3, 't', $4, $5::jsonb, $6, '[]'::jsonb)`,
		[id, spec.workspaceId ?? WORKSPACE_A, spec.ownerId ?? USER_A, spec.visibility ?? 'private', JSON.stringify(spec.collaborators ?? []), spec.parentId ?? null],
	);
	return id;
}

async function workspace(id: string): Promise<void> {
	await app.db.query(
		`insert into public.osionos_workspaces (id, owner_id, name, slug) values ($1, $2, 'w', $3) on conflict (id) do nothing`,
		[id, USER_A, `w-${id}`],
	);
}

describe('page trust', () => {
	beforeEach(async () => {
		await workspace(WORKSPACE_A);
		await workspace(WORKSPACE_B);
		await app.db.query('delete from public.osionos_share_rules where workspace_id in ($1, $2)', [WORKSPACE_A, WORKSPACE_B]);
		await app.db.query('delete from public.osionos_workspace_members where workspace_id = $1', [WORKSPACE_A]);
		await app.db.query('delete from public.osionos_pages where workspace_id in ($1, $2)', [WORKSPACE_A, WORKSPACE_B]);
	});

	it('a private page the user owns is trusted', async () => {
		const child = await page({ parentId: await page() });
		assert.deepEqual(await untrustedPageIds(app.db, user, [child]), []);
		assert.deepEqual(await untrustedPageIds(app.db, user, []), []);
	});

	it('the user as the only member keeps the workspace private', async () => {
		await app.db.query(`insert into public.osionos_workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [WORKSPACE_A, USER_A]);
		const id = await page();
		assert.deepEqual(await untrustedPageIds(app.db, user, [id]), []);
	});

	it('a rule that only views, or denies, does not untrust', async () => {
		await addRule('can_view');
		await addRule('no_access');
		assert.deepEqual(await untrustedPageIds(app.db, user, [await page()]), []);
	});

	it('a page in another workspace is untrusted', async () => {
		const id = await page({ workspaceId: WORKSPACE_B });
		assert.deepEqual(await untrustedPageIds(app.db, user, [id]), [id]);
	});

	it('another owner is untrusted', async () => {
		const id = await page({ ownerId: USER_B });
		assert.deepEqual(await untrustedPageIds(app.db, user, [id]), [id]);
	});

	for (const visibility of ['shared', 'public']) {
		it(`visibility ${visibility} is untrusted`, async () => {
			const id = await page({ visibility });
			assert.deepEqual(await untrustedPageIds(app.db, user, [id]), [id]);
		});
	}

	it('one collaborator is untrusted', async () => {
		const id = await page({ collaborators: [{ userId: USER_B, role: 'editor' }] });
		assert.deepEqual(await untrustedPageIds(app.db, user, [id]), [id]);
	});

	it('a second member untrusts every page of the workspace', async () => {
		await app.db.query(`insert into public.osionos_workspace_members (workspace_id, user_id, role) values ($1, $2, 'editor')`, [WORKSPACE_A, USER_B]);
		const id = await page();
		assert.deepEqual(await untrustedPageIds(app.db, user, [id]), [id]);
	});

	for (const permission of ['can_edit', 'can_comment']) {
		it(`a ${permission} share rule untrusts every page of the workspace`, async () => {
			await addRule(permission);
			const id = await page();
			assert.deepEqual(await untrustedPageIds(app.db, user, [id]), [id]);
		});
	}

	it('an untrusted ancestor untrusts the page', async () => {
		const root = await page({ visibility: 'shared' });
		const child = await page({ parentId: root });
		assert.deepEqual(await untrustedPageIds(app.db, user, [child]), [child]);
	});

	it('an ancestor in another workspace untrusts the page', async () => {
		const root = await page({ workspaceId: WORKSPACE_B });
		const child = await page({ parentId: root });
		assert.deepEqual(await untrustedPageIds(app.db, user, [child]), [child]);
	});

	it('a missing id is untrusted, and only the untrusted ones come back, in order', async () => {
		const own = await page();
		const missing = randomUUID();
		const shared = await page({ visibility: 'shared' });
		assert.deepEqual(await untrustedPageIds(app.db, user, [missing, own, shared]), [missing, shared]);
	});

	it('a dangling parent is untrusted', async () => {
		// The foreign key would null the parent; replica mode lets the test write the row it forbids.
		const child = randomUUID();
		const client = await app.db.connect();
		try {
			await client.query('begin');
			await client.query('set local session_replication_role = replica');
			await client.query(
				`insert into public.osionos_pages (id, workspace_id, owner_id, title, visibility, parent_page_id, content)
				 values ($1, $2, $3, 't', 'private', $4, '[]'::jsonb)`,
				[child, WORKSPACE_A, USER_A, randomUUID()],
			);
			await client.query('commit');
		} finally {
			client.release();
		}
		assert.deepEqual(await untrustedPageIds(app.db, user, [child]), [child]);
	});

	it('a chain deeper than the bound is untrusted', async () => {
		let parent: string | null = null;
		let leaf = '';
		for (let depth = 0; depth < 70; depth += 1) {
			leaf = await page({ parentId: parent });
			parent = leaf;
		}
		assert.deepEqual(await untrustedPageIds(app.db, user, [leaf]), [leaf]);
	});
});

async function addRule(permission: string, resourceId = randomUUID()): Promise<void> {
	await app.db.query(
		`insert into public.osionos_share_rules (workspace_id, resource_type, resource_id, target, permission, explicit)
		 values ($1, 'page', $2, '{"type":"user"}'::jsonb, $3, true)`,
		[WORKSPACE_A, resourceId, permission],
	);
}
