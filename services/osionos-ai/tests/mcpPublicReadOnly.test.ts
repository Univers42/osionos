import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

/**
 * Public mode is read-only on the MCP endpoint (FB5, review I-2): the mint
 * refuses write_approval, and a stored token that carries it anyway (minted
 * on another instance, or before public mode) is cut down when it is used.
 * Set before the harness reads the configuration.
 */
process.env.OSIONOS_AI_PUBLIC_MODE = 'on';

const { USER_A, WORKSPACE_A, addMember, app, callTool, clearWindows, closeAll, mint, rpc } = await import('./mcpHarness.ts');

after(closeAll);
beforeEach(async () => {
	await clearWindows();
	await app.db.query('delete from public.ai_access_tokens');
	await addMember(WORKSPACE_A, USER_A);
});

describe('public mode: a stored write_approval token is read-only', () => {
	it('lists no write tool and refuses a write call, with no approval row', async () => {
		const { id, token } = await mint(USER_A, [WORKSPACE_A], ['read']);
		await app.db.query(`update public.ai_access_tokens set scopes = array['read','write_approval'] where id = $1::uuid`, [id]);
		const list = await rpc(token, 'tools/list');
		const names = (list.body.result.tools as { name: string }[]).map((tool) => tool.name);
		assert.ok(names.length > 0, 'the reads are still served');
		for (const write of ['create_page', 'add_blocks', 'archive_page', 'rename_page', 'update_page_settings']) {
			assert.ok(!names.includes(write), `${write} must not be listed`);
		}
		const call = await callTool(token, 'create_page', { title: 'Nope', workspaceId: WORKSPACE_A });
		assert.ok(call.isError || call.answer.body?.error, call.answer.raw);
		const rows = await app.db.query(`select count(*)::int as n from public.ai_approvals`);
		assert.equal(rows.rows[0].n, 0);
	});
});
