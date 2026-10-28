import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { AuthUser } from '../src/auth.ts';
import type { QueryRunner } from '../src/db.ts';
import { loadAccessMaps } from '../src/retrieval/shareRules.ts';
import { attributeRuleMatches } from '../../../scripts/bridge-share-rules.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WS1 = '1000000a-0000-4000-8000-00000000000a';
const USER = '2000000a-0000-4000-8000-00000000000a';
const WS_OWNER = '20000000-0000-4000-8000-000000000004';
const PAGE_A = '4000000a-0000-4000-8000-00000000000a';

function userAs(userId: string): AuthUser {
	return { userId, workspaceId: WS1, memberWorkspaces: [], isAdmin: false, issuedAtMs: 0 };
}

describe('shareRules attributes', () => {
	let warn: { mock: { callCount(): number } };
	beforeEach(() => { warn = mock.method(console, 'warn', () => undefined); });
	afterEach(() => mock.restoreAll());

	it('skips the attribute read when no rule names an attribute', async () => {
		const calls: string[] = [];
		const db = {
			async query(sql: string, params?: unknown[]) {
				calls.push(sql);
				if (sql.includes('osionos_share_rules')) return { rows: [{ id: 'r1', workspace_id: WS1, resource_type: 'page', resource_id: PAGE_A, target: { type: 'user', userId: USER }, permission: 'can_view', explicit: true }] } as never;
				if (sql.includes('osionos_workspace_members')) return { rows: [{ workspace_id: WS1, role: 'member', permissions: ['read'] }] } as never;
				if (sql.includes('osionos_workspaces')) return { rows: [{ id: WS1, owner_id: WS_OWNER }] } as never;
				if (sql.includes('osionos_pages')) return { rows: [] } as never;
				return { rows: [] } as never;
			},
		};
		await loadAccessMaps(db as unknown as QueryRunner, userAs(USER), [WS1]);
		assert.equal(calls.some((s) => s.includes('osionos_member_attributes')), false);
	});

	it('returns null attributes when the read exceeds 500 rows', async () => {
		const many = Array.from({ length: 501 }, (_, i) => ({ name: `n${i}`, value: 'v' }));
		const db = {
			async query(sql: string, params?: unknown[]) {
				if (sql.includes('osionos_share_rules')) return { rows: [{ id: 'r1', workspace_id: WS1, resource_type: 'page', resource_id: PAGE_A, target: { type: 'attribute', name: 'role', value: 'admin' }, permission: 'can_view', explicit: true }] } as never;
				if (sql.includes('osionos_workspace_members')) return { rows: [{ workspace_id: WS1, role: 'member', permissions: ['read'] }] } as never;
				if (sql.includes('osionos_workspaces')) return { rows: [{ id: WS1, owner_id: WS_OWNER }] } as never;
				if (sql.includes('osionos_pages')) return { rows: [] } as never;
				if (sql.includes('osionos_member_attributes')) return { rows: many } as never;
				return { rows: [] } as never;
			},
		};
		const maps = await loadAccessMaps(db as unknown as QueryRunner, userAs(USER), [WS1]);
		const entry = maps.get(WS1.toLowerCase());
		assert.ok(entry);
		assert.equal(entry!.attributes, null);
	});

	it('C644: parity fixture case shapes are loaded', async () => {
		// smoke: attribute read is invoked when a rule names an attribute
		const calls: string[] = [];
		const db = {
			async query(sql: string, params?: unknown[]) {
				calls.push(sql);
				if (sql.includes('osionos_share_rules')) return { rows: [{ id: 'r1', workspace_id: WS1, resource_type: 'page', resource_id: PAGE_A, target: { type: 'attribute', name: 'role', value: 'admin' }, permission: 'can_view', explicit: true }] } as never;
				if (sql.includes('osionos_workspace_members')) return { rows: [{ workspace_id: WS1, role: 'member', permissions: ['read'] }] } as never;
				if (sql.includes('osionos_workspaces')) return { rows: [{ id: WS1, owner_id: WS_OWNER }] } as never;
				if (sql.includes('osionos_pages')) return { rows: [] } as never;
				if (sql.includes('osionos_member_attributes')) return { rows: [{ name: 'role', value: 'admin' }] } as never;
				return { rows: [] } as never;
			},
		};
		const maps = await loadAccessMaps(db as unknown as QueryRunner, userAs(USER), [WS1]);
		const entry = maps.get(WS1.toLowerCase());
		assert.ok(entry);
		assert.deepEqual(entry!.attributes, [{ name: 'role', value: 'admin' }]);
	});

	it('C644: AI matcher agrees with the bridge on the shared fixture', () => {
		const here = dirname(fileURLToPath(import.meta.url));
		const fixturePath = join(here, '..', '..', '..', 'tests', 'bridge', 'fixtures', 'attribute-parity.json');
		const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
		for (const c of fixture.cases) {
			const perm = c.permission ?? fixture.permission;
			const rule = { resource_type: 'page', resource_id: 'p1', workspace_id: fixture.ruleWorkspaceId ?? 'w1', target: { type: 'attribute', name: fixture.rule.name, value: fixture.rule.value }, permission: perm };
			const ctx = { userId: 'u1', role: c.guest ? 'guest' : 'member', workspaceId: c.workspaceId, teamIds: [], attributes: c.attributes };
			assert.equal(attributeRuleMatches(rule, rule.target, ctx), c.expectedMatch, c.name);
		}
	});
});