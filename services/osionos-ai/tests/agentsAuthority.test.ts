import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import type { Pool } from 'pg';
import { canAdminAgents, canReadAgents, canRunAgents } from '../src/agents/authority.ts';
import type { AuthUser } from '../src/auth.ts';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** A token whose own (private) workspace is the one asked about. */
const USER: AuthUser = {
	userId: '11111111-1111-4111-8111-111111111111',
	workspaceId: WORKSPACE,
	memberWorkspaces: [],
	isAdmin: false,
	issuedAtMs: 0,
};

/** A pool whose members table holds the given row, or none. */
function poolWith(row: { role: string; permissions: string[] } | null): { pool: Pool; asked: number } {
	const state = { asked: 0, pool: null as unknown as Pool };
	state.pool = {
		query: async (sql: string) => {
			assert.ok(sql.includes('osionos_workspace_members'), 'authority reads the member row');
			state.asked += 1;
			return { rows: row ? [row] : [] };
		},
	} as unknown as Pool;
	return state;
}

describe('authority over agents is the live member row', () => {
	it('C330: a token whose workspaceId is the workspace but has no member row is refused on every gate', async () => {
		const state = poolWith(null);
		assert.equal(await canReadAgents(state.pool, USER, WORKSPACE), false);
		assert.equal(await canRunAgents(state.pool, USER, WORKSPACE), false);
		assert.equal(await canAdminAgents(state.pool, USER, WORKSPACE), false);
		assert.equal(state.asked, 3, 'each gate asked the table, none trusted the claim');
	});

	it('C330: a member row decides: admin passes all, a reader passes only read', async () => {
		const admin = poolWith({ role: 'admin', permissions: [] });
		assert.equal(await canAdminAgents(admin.pool, USER, WORKSPACE), true);
		const reader = poolWith({ role: 'member', permissions: ['read'] });
		assert.equal(await canReadAgents(reader.pool, USER, WORKSPACE), true);
		assert.equal(await canRunAgents(reader.pool, USER, WORKSPACE), false);
		assert.equal(await canAdminAgents(reader.pool, USER, WORKSPACE), false);
	});

	it('C330: agent code never imports authorityIn or liveMemberWorkspaces', () => {
		const dir = new URL('../src/agents/', import.meta.url);
		for (const file of readdirSync(dir)) {
			const code = readFileSync(new URL(file, dir), 'utf8');
			// Comments may name them; an import or a call may not.
			const lines = code.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line));
			assert.ok(!lines.some((line) => /authorityIn|liveMemberWorkspaces/.test(line)), file);
		}
	});
});
