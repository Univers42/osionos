import type { ToolSet } from 'ai';
import { argsSha256 } from './canonical.ts';
import { countExecutedInRun, insertApproval } from './repo.ts';
import { WRITE_TOOLS } from '../tools/writeTools.ts';
import type { ToolHooks, ToolPool } from '../tools/index.ts';
import type { WriteToolContext } from '../tools/types.ts';
import type { ApprovalContext, PermissionAsked } from './types.ts';

/**
 * The write tools, as the model sees them.
 *
 * The execute of a write tool WRITES NOTHING. It validates the arguments,
 * drops the ones the schema does not know, stores the rest in an approval
 * row, emits `permission.asked`, and tells the model to stop and wait.
 *
 * The write itself happens later, in the request that decides the approval,
 * with the token of that request. Nothing here holds a token.
 */

/** The most bytes the arguments of an approval may take. */
export const MAX_APPROVAL_ARGS_BYTES = 64 * 1024;

/** What the model reads when its request is on the table, waiting for the user. */
export const WAITING_FOR_APPROVAL = "The request is waiting for the user's approval: say so and stop.";

/**
 * The write tools of a run.
 *
 * The pool of the run holds the answers of the tools, and a write tool answers
 * with a sentence: the pool is never the reason a request is refused.
 */
export function writeToolSet(
	ctx: WriteToolContext,
	hooks: ToolHooks,
	pool: ToolPool,
	approval: ApprovalContext,
): ToolSet {
	const set: ToolSet = {};
	for (const tool of WRITE_TOOLS) {
		set[tool.name] = {
			description: tool.description,
			inputSchema: tool.input,
			execute: async (rawInput: unknown, options: { toolCallId: string }) => {
				const parsed = tool.input.safeParse(rawInput);
				if (!parsed.success) {
					await hooks.onResult?.({
						toolCallId: options.toolCallId,
						toolName: tool.name,
						ok: false,
						error: 'the arguments do not fit the tool',
					});
					return pool.draw(
						'The arguments of this call do not fit the tool. Call it again with the arguments it takes.',
					);
				}
				let plan;
				try {
					plan = await tool.run(ctx, parsed.data);
				} catch {
					plan = { ok: false as const, error: 'the tool failed' };
				}
				if (!plan.ok) {
					await hooks.onResult?.({
						toolCallId: options.toolCallId,
						toolName: tool.name,
						ok: false,
						error: plan.error,
					});
					return pool.draw(plan.error);
				}
				// The arguments are bounded: a page is not a megabyte, and the
				// table of the approvals is not a bin.
				const bytes = Buffer.byteLength(JSON.stringify(plan.data.args), 'utf8');
				if (bytes > MAX_APPROVAL_ARGS_BYTES) {
					await hooks.onResult?.({
						toolCallId: options.toolCallId,
						toolName: tool.name,
						ok: false,
						error: 'the request is too big',
					});
					return pool.draw('This request is too big to be approved. Ask for less at a time.');
				}
				// The row: the state of the decision. A null row means the same
				// call is already waiting — the index refuses the duplicate.
				const row = await insertApproval(ctx.db, {
					runId: approval.runId,
					conversationId: approval.conversationId,
					ownerId: approval.ownerId,
					workspaceId: plan.data.target.workspaceId,
					tool: tool.name,
					args: plan.data.args,
					argsSha256: argsSha256(plan.data.args),
				});
				if (!row) {
					await hooks.onResult?.({
						toolCallId: options.toolCallId,
						toolName: tool.name,
						ok: false,
						error: 'the request is already waiting',
					});
					return pool.draw('This request is already waiting for the user. Do not ask again.');
				}
				const asked: PermissionAsked = {
					approvalId: row.id,
					tool: tool.name,
					verb: tool.verb,
					target: plan.data.target,
					args: plan.data.args,
					preview: plan.data.preview,
					provenance: { pageIds: [...approval.provenance()] },
					approvedInRun: await countExecutedInRun(ctx.db, approval.runId),
					expiresAt: new Date(row.expires_at).toISOString(),
				};
				await hooks.onApproval?.(asked);
				await hooks.onResult?.({ toolCallId: options.toolCallId, toolName: tool.name, ok: true });
				return pool.draw(WAITING_FOR_APPROVAL);
			},
		};
	}
	return set;
}
