import type { ToolSet } from 'ai';
import { config } from '../config.ts';
import { influencedBy } from '../mcpClient/taint.ts';
import { countExecutedInRun } from './repo.ts';
import { proposeWrite } from './propose.ts';
import { writeTools } from '../tools/writeToolList.ts';
import type { ToolHooks, ToolPool } from '../tools/index.ts';
import type { WriteToolContext } from '../tools/types.ts';
import type { ApprovalContext, PermissionAsked } from './types.ts';

/**
 * The write tools, as the model of a run sees them.
 *
 * The execute of a write tool WRITES NOTHING. The proposal itself lives in
 * `propose.ts`, shared with the remote MCP endpoint: this file is the glue of
 * a RUN, and it keeps the hooks, the pool and the `permission.asked` event.
 *
 * The write itself happens later, in the request that decides the approval,
 * with the token of that request. Nothing here holds a token.
 */

/** The cap of the arguments lives with the proposal path. */
export { MAX_APPROVAL_ARGS_BYTES } from './propose.ts';

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
	for (const tool of writeTools()) {
		set[tool.name] = {
			description: tool.description,
			inputSchema: tool.input,
			execute: async (rawInput: unknown, options: { toolCallId: string }) => {
				const result = await proposeWrite(ctx, tool, rawInput, {
					kind: 'run',
					runId: approval.runId,
					conversationId: approval.conversationId,
					ownerId: approval.ownerId,
				});
				if (!result.ok) {
					await hooks.onResult?.({
						toolCallId: options.toolCallId,
						toolName: tool.name,
						ok: false,
						error: result.error,
					});
					return pool.draw(result.message);
				}
				const asked: PermissionAsked = {
					approvalId: result.row.id,
					tool: tool.name,
					verb: tool.verb,
					target: result.plan.target,
					args: result.plan.args,
					preview: result.plan.preview,
					provenance: { pageIds: [...approval.provenance()] },
					approvedInRun: await countExecutedInRun(ctx.db, approval.runId),
					expiresAt: new Date(result.row.expires_at).toISOString(),
				};
				// C286: a write asked after MCP output entered the conversation
				// says so on its card. Off, or no MCP call: no key at all (C291).
				if (config.mcpClientEnabled) {
					const tainted = await influencedBy(ctx.db, approval.conversationId);
					if (tainted.length > 0) asked.influencedBy = tainted;
				}
				await hooks.onApproval?.(asked);
				await hooks.onResult?.({ toolCallId: options.toolCallId, toolName: tool.name, ok: true });
				return pool.draw(WAITING_FOR_APPROVAL);
			},
		};
	}
	return set;
}
