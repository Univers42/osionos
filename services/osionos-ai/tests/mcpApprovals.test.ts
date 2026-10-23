import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';

/**
 * The remote MCP writes are APPROVALS (G4b-2, devil C117 with C114 and C115):
 * an outside agent proposes, the user decides in osionos, and the token never
 * writes. The read side is in mcpTools.test.ts and mcpAccess.test.ts.
 *
 * The write window of this file is low on purpose: the per-minute cap is one
 * call away from a fresh token, so the cap can be seen in a test. The service
 * reads its configuration on import, so the variable is set before the harness
 * is imported.
 *
 * A run-origin approval and its continuation are covered end to end by
 * tests/approvalDecision.test.ts: "approving writes once, with the token of the
 * request (C7, C10)" and "the continuation is a run of its own, with its own
 * reservation (C5, C13)".
 */
process.env.OSIONOS_AI_MCP_WRITES_PER_MINUTE = '3';

const {
	USER_A,
	USER_B,
	WORKSPACE_A,
	WORKSPACE_B,
	addMember,
	app,
	bridge,
	callTool,
	clearWindows,
	closeAll,
	mint,
	raw,
	rpc,
	sessionFor,
} = await import('./mcpHarness.ts');
const { READ_TOOLS } = await import('../src/tools/readTools.ts');
const { WRITE_TOOLS } = await import('../src/tools/writeTools.ts');
const { insertApproval } = await import('../src/approvals/repo.ts');

after(closeAll);
beforeEach(async () => {
	await clearWindows();
	await app.db.query('delete from public.ai_approvals');
	await app.db.query('delete from public.ai_access_tokens');
	await addMember(WORKSPACE_A, USER_A);
	await addMember(WORKSPACE_B, USER_A);
	bridge.reset();
});

/** The approval rows of a token, oldest first. */
async function rowsOf(tokenId: string): Promise<Record<string, any>[]> {
	const result = await app.db.query(
		'select * from public.ai_approvals where token_id = $1::uuid order by created_at, id',
		[tokenId],
	);
	return result.rows as Record<string, any>[];
}

/** The one approval a token left waiting. */
async function onlyApproval(tokenId: string): Promise<Record<string, any>> {
	const rows = await rowsOf(tokenId);
	assert.equal(rows.length, 1, 'one approval is waiting');
	return rows[0]!;
}

/** A decision of an approval, with an app session. */
function decide(approvalId: string, session: string, decision = 'approve') {
	return raw('POST', `/api/ai/approvals/${approvalId}`, {
		headers: { authorization: `Bearer ${session}` },
		body: { decision },
	});
}

/** The list of the approvals that wait, with an app session. */
function listMcp(session: string) {
	return raw('GET', '/api/ai/approvals?origin=mcp', {
		headers: { authorization: `Bearer ${session}` },
	});
}

/** Twenty pending rows of a token, written directly: the cap is what the next call meets. */
async function seedPending(tokenId: string, count: number): Promise<void> {
	for (let index = 0; index < count; index += 1) {
		await app.db.query(
			`insert into public.ai_approvals
			   (origin, token_id, owner_id, workspace_id, tool, args, args_sha256, status, expires_at)
			 values ('mcp', $1::uuid, $2::uuid, $3::uuid, 'create_page', $4::jsonb, $5, 'pending', now() + interval '10 minutes')`,
			[
				tokenId,
				USER_A,
				WORKSPACE_A,
				JSON.stringify({ title: `waiting ${index}`, workspaceId: WORKSPACE_A }),
				`seed-${index}`,
			],
		);
	}
}

describe('what a token sees (C117)', () => {
	it('read lists the reads only, read+write_approval lists the reads and the three writes', async () => {
		const read = await mint(USER_A, [WORKSPACE_A], ['read']);
		const readList = await rpc(read.token, 'tools/list');
		const readNames = (readList.body.result.tools as { name: string }[]).map((tool) => tool.name).sort();
		assert.deepEqual(readNames, READ_TOOLS.map((tool) => tool.name).sort());

		const write = await mint(USER_A, [WORKSPACE_A], ['read', 'write_approval']);
		const writeList = await rpc(write.token, 'tools/list');
		const writeNames = (writeList.body.result.tools as { name: string }[]).map((tool) => tool.name).sort();
		assert.deepEqual(
			writeNames,
			[...READ_TOOLS.map((tool) => tool.name), ...WRITE_TOOLS.map((tool) => tool.name)].sort(),
		);
		// C23 is not met: no build_plan, and no content write.
		assert.ok(!writeNames.includes('build_plan'));
		assert.deepEqual(
			WRITE_TOOLS.map((tool) => tool.name).sort(),
			['archive_page', 'create_page', 'rename_page'],
		);
	});

	it('a read-only token calling a write tool gets the unknown tool, and no row', async () => {
		const read = await mint(USER_A, [WORKSPACE_A], ['read']);
		const call = await rpc(read.token, 'tools/call', {
			name: 'create_page',
			arguments: { title: 'Not mine', workspaceId: WORKSPACE_A },
		});
		assert.ok(call.body?.error || call.body?.result?.isError, call.raw);
		const rows = await app.db.query(`select count(*)::int as n from public.ai_approvals`);
		assert.equal(rows.rows[0].n, 0);
	});
});

describe('the proposal of an MCP write (C117, C115)', () => {
	it('one row with the mcp origin and the token id, and zero bridge calls', async () => {
		const token = await mint(USER_A, [WORKSPACE_A], ['read', 'write_approval']);
		const answer = await callTool(token.token, 'create_page', {
			title: 'From the agent',
			workspaceId: WORKSPACE_A,
		});
		assert.equal(answer.isError, false, answer.text);
		const row = await onlyApproval(token.id);
		assert.equal(row.origin, 'mcp');
		assert.equal(String(row.token_id), token.id);
		assert.equal(row.run_id, null);
		assert.equal(row.conversation_id, null);
		assert.equal(row.status, 'pending');
		assert.equal(bridge.count, 0, 'the bridge saw nothing: the write has not happened');
		assert.ok(answer.text.includes(String(row.id)), 'the answer names the approval');
		assert.match(answer.text, /approve/i);
	});

	it('the same call again is refused as already waiting, and no second row', async () => {
		const token = await mint(USER_A, [WORKSPACE_A], ['write_approval']);
		const args = { title: 'Once', workspaceId: WORKSPACE_A };
		assert.equal((await callTool(token.token, 'create_page', args)).isError, false);
		const again = await callTool(token.token, 'create_page', args);
		assert.equal(again.isError, true);
		assert.match(again.text, /already waiting/i);
		assert.equal((await rowsOf(token.id)).length, 1);
	});

	it('a target outside the token scope is refused, and no row is written', async () => {
		// The user IS a member of B: the refusal comes from the TOKEN's scope
		// (C115), not from a missing membership.
		const token = await mint(USER_A, [WORKSPACE_A], ['write_approval']);
		const refused = await callTool(token.token, 'create_page', {
			title: 'Elsewhere',
			workspaceId: WORKSPACE_B,
		});
		assert.equal(refused.isError, true);
		assert.match(refused.text, /not one of yours/i);
		assert.equal((await rowsOf(token.id)).length, 0, 'no row for a target out of scope');
		assert.equal(bridge.count, 0);
	});
});

describe('the question of an agent waits longer (G4b-3)', () => {
	it('an MCP row expires in about an hour, and a run row stays at ten minutes', async () => {
		const token = await mint(USER_A, [WORKSPACE_A], ['write_approval']);
		const call = await callTool(token.token, 'create_page', {
			title: 'A question that waits',
			workspaceId: WORKSPACE_A,
		});
		assert.equal(call.isError, false, call.text);
		const mcpRow = await onlyApproval(token.id);
		const mcpMinutes = (new Date(mcpRow.expires_at).getTime() - Date.now()) / 60_000;
		assert.ok(
			Math.abs(mcpMinutes - 60) <= 1,
			`the MCP row waits about 60 minutes, not ${mcpMinutes.toFixed(1)}`,
		);

		// A run's approval still lives ten minutes: the run is waiting on it.
		const conversationId = randomUUID();
		const runId = randomUUID();
		await app.db.query(
			`insert into public.ai_conversations (id, owner_id, workspace_id)
			 values ($1::uuid, $2::uuid, $3::uuid)`,
			[conversationId, USER_A, WORKSPACE_A],
		);
		await app.db.query(
			`insert into public.ai_runs (id, conversation_id, owner_id, status, model)
			 values ($1::uuid, $2::uuid, $3::uuid, 'succeeded', 'mock-model')`,
			[runId, conversationId, USER_A],
		);
		const runRow = await insertApproval(app.db, {
			source: { kind: 'run', runId, conversationId, ownerId: USER_A },
			workspaceId: WORKSPACE_A,
			tool: 'create_page',
			args: { title: 'A run write', workspaceId: WORKSPACE_A },
			argsSha256: 'run-ttl',
		});
		assert.ok(runRow, 'the run row was written');
		const runMinutes = (new Date(runRow.expires_at).getTime() - Date.now()) / 60_000;
		assert.ok(
			Math.abs(runMinutes - 10) <= 1,
			`a run's row waits about 10 minutes, not ${runMinutes.toFixed(1)}`,
		);
	});
});

describe('the decision of an MCP approval (C114, C115, C117)', () => {
	it('the app session approves: the write lands with the session token, and no run starts', async () => {
		const token = await mint(USER_A, [WORKSPACE_A], ['write_approval']);
		const call = await callTool(token.token, 'create_page', {
			title: 'Approved later',
			workspaceId: WORKSPACE_A,
		});
		assert.equal(call.isError, false, call.text);
		const row = await onlyApproval(token.id);
		const before = await app.db.query(`select count(*)::int as n from public.ai_runs`);

		const session = sessionFor(USER_A, WORKSPACE_A);
		const answer = await decide(String(row.id), session);
		assert.equal(answer.status, 200, answer.raw);
		assert.equal(answer.body.status, 'executed');
		assert.equal(answer.body.continuationRunId, null, 'an MCP approval never continues a run');

		const writes = bridge.ofMethod('POST');
		assert.equal(writes.length, 1, 'exactly one write');
		assert.equal(writes[0]!.authorization, `Bearer ${session}`, 'the session token wrote, never the PAT');
		const after = await app.db.query(`select count(*)::int as n from public.ai_runs`);
		assert.equal(after.rows[0].n, before.rows[0].n, 'no ai_runs row was created');
		const decided = await app.db.query('select status from public.ai_approvals where id = $1', [row.id]);
		assert.equal(decided.rows[0].status, 'executed');

		// A decided write frees its call: a token lives for months, and the
		// same request asked again later is a new question.
		const again = await callTool(token.token, 'create_page', { title: 'Approved later', workspaceId: WORKSPACE_A });
		assert.equal(again.isError, false, again.text);
		assert.equal((await rowsOf(token.id)).length, 2);
	});

	it('a revoked token expires the approval at decision time, and writes nothing', async () => {
		const token = await mint(USER_A, [WORKSPACE_A], ['write_approval']);
		const call = await callTool(token.token, 'create_page', {
			title: 'Revoked before yes',
			workspaceId: WORKSPACE_A,
		});
		assert.equal(call.isError, false, call.text);
		const row = await onlyApproval(token.id);
		const revoked = await raw('DELETE', `/api/ai/access-tokens/${token.id}`, {
			headers: { authorization: `Bearer ${sessionFor(USER_A, WORKSPACE_A)}` },
		});
		assert.equal(revoked.status, 204);

		const answer = await decide(String(row.id), sessionFor(USER_A, WORKSPACE_A));
		assert.equal(answer.status, 409);
		assert.equal(answer.body.code, 'approval_expired');
		const decided = await app.db.query('select status from public.ai_approvals where id = $1', [row.id]);
		assert.equal(decided.rows[0].status, 'expired');
		assert.equal(bridge.count, 0, 'nothing was written');
	});

	it('a workspace taken out of the token scope expires the approval, and writes nothing', async () => {
		const token = await mint(USER_A, [WORKSPACE_A], ['write_approval']);
		const call = await callTool(token.token, 'create_page', {
			title: 'The scope shrank',
			workspaceId: WORKSPACE_A,
		});
		assert.equal(call.isError, false, call.text);
		const row = await onlyApproval(token.id);
		await app.db.query('update public.ai_access_tokens set workspace_ids = $2::uuid[] where id = $1::uuid', [
			token.id,
			[WORKSPACE_B],
		]);

		const answer = await decide(String(row.id), sessionFor(USER_A, WORKSPACE_A));
		assert.equal(answer.status, 409);
		assert.equal(answer.body.code, 'approval_expired');
		const decided = await app.db.query('select status from public.ai_approvals where id = $1', [row.id]);
		assert.equal(decided.rows[0].status, 'expired');
		assert.equal(bridge.count, 0, 'nothing was written');
	});
});

describe('the limits before a row exists (C117)', () => {
	it('the 21st pending approval of a token is refused, and no row is added', async () => {
		const token = await mint(USER_A, [WORKSPACE_A], ['write_approval']);
		await seedPending(token.id, 20);
		assert.equal((await rowsOf(token.id)).length, 20);
		// The write window is fresh: the cap that refuses is the pending one.
		await clearWindows();

		const refused = await callTool(token.token, 'create_page', {
			title: 'The twenty-first',
			workspaceId: WORKSPACE_A,
		});
		assert.equal(refused.isError, true);
		assert.match(refused.text, /waiting for the user/i);
		assert.equal((await rowsOf(token.id)).length, 20, 'no row was added');
	});

	it('the per-minute window refuses after its cap, and writes no row', async () => {
		const token = await mint(USER_A, [WORKSPACE_A], ['write_approval']);
		await clearWindows();
		// The file sets the cap to 3 before the service is imported.
		for (let index = 0; index < 3; index += 1) {
			const accepted = await callTool(token.token, 'create_page', {
				title: `Window ${index}`,
				workspaceId: WORKSPACE_A,
			});
			assert.equal(accepted.isError, false, accepted.text);
		}
		const refused = await callTool(token.token, 'create_page', {
			title: 'Window 3',
			workspaceId: WORKSPACE_A,
		});
		assert.equal(refused.isError, true);
		assert.match(refused.text, /too many writes/i);
		assert.equal((await rowsOf(token.id)).length, 3, 'the refused call added no row');
	});
});

describe('the list of what waits (C114)', () => {
	it('a PAT is 401 on the decision and on the list; an app session sees only its own rows', async () => {
		const token = await mint(USER_A, [WORKSPACE_A], ['write_approval']);
		const call = await callTool(token.token, 'create_page', {
			title: 'Listed',
			workspaceId: WORKSPACE_A,
		});
		assert.equal(call.isError, false, call.text);
		const row = await onlyApproval(token.id);

		// C114: the token never decides, and never lists.
		const patDecision = await raw('POST', `/api/ai/approvals/${row.id}`, {
			headers: { authorization: `Bearer ${token.token}` },
			body: { decision: 'approve' },
		});
		assert.equal(patDecision.status, 401);
		const patList = await raw('GET', '/api/ai/approvals?origin=mcp', {
			headers: { authorization: `Bearer ${token.token}` },
		});
		assert.equal(patList.status, 401);

		const mine = await listMcp(sessionFor(USER_A, WORKSPACE_A));
		assert.equal(mine.status, 200, mine.raw);
		const approvals = mine.body.approvals as Record<string, unknown>[];
		const entry = approvals.find((candidate) => String(candidate.approvalId) === String(row.id));
		assert.ok(entry, 'the approval of A is listed');
		assert.equal(entry.origin, 'mcp');
		assert.equal(entry.agentName, 'agent', 'the name of the token is the agent name');

		const others = await listMcp(sessionFor(USER_B, WORKSPACE_A));
		assert.equal(others.status, 200);
		assert.deepEqual(others.body.approvals, [], 'the rows of A never appear for B');
	});
});
