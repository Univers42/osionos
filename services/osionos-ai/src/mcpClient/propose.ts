import { jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { argsSha256 } from '../approvals/canonical.ts';
import { countExecutedInRun, insertApproval } from '../approvals/repo.ts';
import { MAX_APPROVAL_ARGS_BYTES } from '../approvals/propose.ts';
import { WAITING_FOR_APPROVAL } from '../approvals/toolSet.ts';
import type { ApprovalContext, PermissionAsked } from '../approvals/types.ts';
import { checkRateLimit } from '../rateLimit.ts';
import type { ToolHooks, ToolPool } from '../tools/index.ts';
import { cardOf } from './card.ts';
import type { StoredMcpCall } from './card.ts';
import { countPendingCalls, getToolNow } from './repo.ts';
import type { McpToolEntry } from './runTools.ts';
import { argsFit } from './schema.ts';
import { influencedBy } from './taint.ts';

/**
 * The proposal of an MCP call (C280, C283).
 *
 * The execute of an MCP tool CALLS NOTHING. It checks the arguments, stores
 * the question as an approval row, and asks: every call, with no exception,
 * waits for the user (C280). The server is contacted in the request that
 * decides, after the claim, and never here. One MCP call per step reaches a
 * card; a second one in the same step is refused (C283, the stricter of C280
 * and C283, whose tests disagreed on two calls in one step).
 *
 * Caveat: the per-minute window is the fixed one of the runs, which lets
 * through up to twice the limit around a minute boundary (src/rateLimit.ts).
 */

export const MCP_PENDING_MAX = 20;
export const MCP_PROPOSALS_PER_MINUTE = 10;
export const MCP_PROPOSAL_LIMIT_PREFIX = 'ai:rl:mcp-run';

export interface McpRunContext {
	db: Pool;
	redis: Redis;
	/** The workspace the conversation runs in: an approval row needs one. */
	workspaceId: string;
	tools: readonly McpToolEntry[];
	approval: ApprovalContext;
	hooks: ToolHooks;
	pool: ToolPool;
}

/** The MCP tools of a run, as a tool set. */
export function mcpToolSet(ctx: McpRunContext): ToolSet {
	const set: ToolSet = {};
	// The step that already holds an MCP call: one per step (C283).
	let claimedStep = -1;
	for (const entry of ctx.tools) {
		set[entry.modelName] = {
			description: entry.description,
			inputSchema: jsonSchema(entry.inputSchema as Parameters<typeof jsonSchema>[0]),
			execute: async (rawInput: unknown, options: { toolCallId: string }) => {
				const refuse = async (error: string, message: string) => {
					await ctx.hooks.onResult?.({ toolCallId: options.toolCallId, toolName: entry.modelName, ok: false, error });
					return ctx.pool.draw(message);
				};
				if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput) || !argsFit(entry.inputSchema, rawInput)) {
					return refuse('the arguments do not fit the tool', 'The arguments of this call do not fit the tool. Call it again with the arguments it takes.');
				}
				const callArgs = rawInput as Record<string, unknown>;
				if (Buffer.byteLength(JSON.stringify(callArgs), 'utf8') > MAX_APPROVAL_ARGS_BYTES) {
					return refuse('the request is too big', 'This request is too big to be approved. Ask for less at a time.');
				}
				// The claim and its check are ONE stretch with no await: the calls
				// of a step interleave at the awaits only, so two never both pass.
				if (claimedStep === ctx.pool.step) {
					return refuse('one outside tool call per step', 'Only one call to an outside tool can be asked at a time. Wait for the user to decide on the first one.');
				}
				claimedStep = ctx.pool.step;
				// The words may have changed since the run began: the card must
				// show the ones the user agreed to (C272).
				const now = await getToolNow(ctx.db, entry.serverId, ctx.approval.ownerId, entry.toolName);
				if (!now || !now.enabled || now.snapshot_sha256 !== entry.sha256) {
					return refuse('the tool changed', 'This tool is not available any more. Do not call it again.');
				}
				const waiting = await countPendingCalls(ctx.db, ctx.approval.ownerId);
				if (waiting >= MCP_PENDING_MAX) {
					return refuse('too many calls are waiting', `You already have ${waiting} tool calls waiting for the user. Ask them to decide those first.`);
				}
				const window = await checkRateLimit(ctx.redis, ctx.approval.ownerId, MCP_PROPOSALS_PER_MINUTE, new Date(), MCP_PROPOSAL_LIMIT_PREFIX);
				if (!window.allowed) {
					return refuse('too many calls', 'Too many tool calls were asked in the last minute. Do not ask again now.');
				}
				const stored: StoredMcpCall = {
					serverId: entry.serverId,
					serverLabel: entry.serverLabel,
					serverHost: entry.serverHost,
					toolName: entry.toolName,
					description: entry.description,
					snapshotSha256: entry.sha256,
					arguments: callArgs,
				};
				const row = await insertApproval(ctx.db, {
					source: {
						kind: 'run',
						runId: ctx.approval.runId,
						conversationId: ctx.approval.conversationId,
						ownerId: ctx.approval.ownerId,
					},
					workspaceId: ctx.workspaceId,
					tool: 'mcp_call',
					args: { ...stored },
					argsSha256: argsSha256(stored),
				});
				if (!row) return refuse('the request is already waiting', 'This request is already waiting for the user. Do not ask again.');
				const tainted = await influencedBy(ctx.db, ctx.approval.conversationId);
				const asked: PermissionAsked = {
					approvalId: row.id,
					tool: 'mcp_call',
					verb: `Call ${entry.toolName} on ${entry.serverLabel}`,
					target: { title: entry.toolName, workspaceId: ctx.workspaceId, workspaceName: '' },
					args: callArgs,
					preview: { unit: 'none', count: 0 },
					provenance: { pageIds: [...ctx.approval.provenance()] },
					approvedInRun: await countExecutedInRun(ctx.db, ctx.approval.runId),
					expiresAt: new Date(row.expires_at).toISOString(),
					mcp: cardOf(stored),
					...(tainted.length > 0 ? { influencedBy: tainted } : {}),
				};
				await ctx.hooks.onApproval?.(asked);
				await ctx.hooks.onResult?.({ toolCallId: options.toolCallId, toolName: entry.modelName, ok: true });
				return ctx.pool.draw(WAITING_FOR_APPROVAL);
			},
		};
	}
	return set;
}
