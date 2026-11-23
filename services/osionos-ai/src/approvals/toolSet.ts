import type { ToolSet } from 'ai';
import { config } from '../config.ts';
import { influencedBy } from '../mcpClient/taint.ts';
import { countExecutedInRun } from './repo.ts';
import { proposeWrite } from './propose.ts';
import type { ProposeSuccess } from './propose.ts';
import { writeTools } from '../tools/writeToolList.ts';
import type { ToolPool } from '../tools/index.ts';
import type { WriteToolContext } from '../tools/types.ts';
import { autoDecide } from './autoDecide.ts';
import type { AutoOutcome } from './autoDecide.ts';
import { cardSentence } from './cardReason.ts';
import type { ApprovalContext, CardReason, PermissionAsked, WriteHooks } from './types.ts';

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
	hooks: WriteHooks,
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
				const decision = approval.auto ? await autoDecide(approval.auto, result.row) : null;
				const replied = await replyToAuto(hooks, pool, { toolName: tool.name, toolCallId: options.toolCallId }, decision);
				if (replied !== null) return replied;
				const reason = decision?.kind === 'card' ? decision.reason : undefined;
				await hooks.onApproval?.(await cardOf(ctx, approval, tool, result, reason));
				await hooks.onResult?.({ toolCallId: options.toolCallId, toolName: tool.name, ok: true });
				return pool.draw(reason ? cardSentence(reason) : WAITING_FOR_APPROVAL);
			},
		};
	}
	return set;
}

/** The card of a write that waits for the human: today's data, and why an auto mode did not apply it. */
async function cardOf(
	ctx: WriteToolContext,
	approval: ApprovalContext,
	tool: { name: string; verb: string },
	proposed: ProposeSuccess,
	cardReason: CardReason | undefined,
): Promise<PermissionAsked> {
	const asked: PermissionAsked = {
		approvalId: proposed.row.id,
		tool: tool.name,
		verb: tool.verb,
		target: proposed.plan.target,
		args: proposed.plan.args,
		preview: proposed.plan.preview,
		provenance: { pageIds: [...approval.provenance()] },
		approvedInRun: await countExecutedInRun(ctx.db, approval.runId),
		expiresAt: new Date(proposed.row.expires_at).toISOString(),
		agent: approval.agent ?? null,
		...(cardReason ? { cardReason } : {}),
	};
	const influenced = await influenceOf(ctx, approval);
	return influenced ? { ...asked, influencedBy: influenced } : asked;
}

/**
 * C286 / web C359: a write asked after MCP output or web content entered the
 * conversation says so on its card. Both flags off, or nothing read: no key at
 * all (C291, C375).
 */
async function influenceOf(ctx: WriteToolContext, approval: ApprovalContext): Promise<Awaited<ReturnType<typeof influencedBy>> | null> {
	if (!config.mcpClientEnabled && !config.webEnabled) return null;
	const tainted = await influencedBy(ctx.db, approval.conversationId);
	return tainted.length > 0 ? tainted : null;
}

/** What the model reads when an auto mode applied the write or refused it; null when a card is the answer. */
async function replyToAuto(
	hooks: WriteHooks,
	pool: ToolPool,
	call: { toolName: string; toolCallId: string },
	decision: AutoOutcome | null,
): Promise<string | null> {
	if (decision?.kind === 'applied') {
		await hooks.onApplied?.(decision.event);
		await hooks.onResult?.({ ...call, ok: true });
		return pool.draw(`Applied: ${decision.event.summary}.`);
	}
	if (decision?.kind !== 'refused') return null;
	await hooks.onResult?.({ ...call, ok: false, error: decision.error });
	return pool.draw(`Not applied: ${decision.error}.`);
}
