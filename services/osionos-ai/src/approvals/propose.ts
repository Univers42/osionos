import { config } from '../config.ts';
import { argsSha256 } from './canonical.ts';
import { countPendingPlans, insertApproval } from './repo.ts';
import { MAX_PLAN_ARGS_BYTES } from '../builders/planSchema.ts';
import type { AnyWriteTool, ToolResult, WriteToolContext } from '../tools/types.ts';
import type { ApprovalPlan, ApprovalRow, ApprovalSource } from './types.ts';

/**
 * The proposal of a write: ONE path for a run and for an outside agent.
 *
 * A write tool never writes. It validates the arguments, describes the write,
 * and this module stores the question in an approval row. The caller decides
 * what to do with the answer: a run emits `permission.asked` and stops; the
 * remote MCP endpoint tells the agent that the user must decide in osionos.
 *
 * The origin is not a detail: a row is either a run's or a token's, never
 * both, and the database enforces it with `ai_approvals_origin_shape`.
 */

/** The most bytes the arguments of an approval may take. */
export const MAX_APPROVAL_ARGS_BYTES = 64 * 1024;

/** What the model reads when a call is refused before a row exists. */
export interface ProposeFailure {
	ok: false;
	/** The short, code-like error the run records on `tool.result`. */
	error: string;
	/** The sentence the model reads. */
	message: string;
}

/** The approval that now waits, and the plan it was stored from. */
export interface ProposeSuccess {
	ok: true;
	row: ApprovalRow;
	plan: ApprovalPlan;
}

export type ProposeResult = ProposeSuccess | ProposeFailure;

/**
 * Ask the user for one write.
 *
 * The checks are the ones of the tools: the schema (the whitelist of the
 * arguments), the tool's own access rule, the size cap, and the backlog of the
 * builder plans. Only then is the row written — and a null row means the same
 * call is already waiting, refused by the partial unique index.
 */
export async function proposeWrite(
	ctx: WriteToolContext,
	tool: AnyWriteTool,
	rawInput: unknown,
	source: ApprovalSource,
): Promise<ProposeResult> {
	const parsed = tool.input.safeParse(rawInput);
	if (!parsed.success) {
		return {
			ok: false,
			error: 'the arguments do not fit the tool',
			message: 'The arguments of this call do not fit the tool. Call it again with the arguments it takes.',
		};
	}
	let plan: ToolResult<ApprovalPlan>;
	try {
		plan = await tool.run(ctx, parsed.data);
	} catch {
		plan = { ok: false, error: 'the tool failed' };
	}
	if (!plan.ok) return { ok: false, error: plan.error, message: plan.error };
	// The arguments are bounded: a page is not a megabyte, and the table of the
	// approvals is not a bin.
	const bytes = Buffer.byteLength(JSON.stringify(plan.data.args), 'utf8');
	if (bytes > (tool.name === 'build_plan' ? MAX_PLAN_ARGS_BYTES : MAX_APPROVAL_ARGS_BYTES)) {
		return {
			ok: false,
			error: 'the request is too big',
			message: 'This request is too big to be approved. Ask for less at a time.',
		};
	}
	// The plans a user may have waiting at once (C161): a backlog of cards is a
	// backlog of decisions nobody is making.
	if (tool.name === 'build_plan') {
		const waiting = await countPendingPlans(ctx.db, source.ownerId);
		if (waiting >= config.pendingPlans) {
			return {
				ok: false,
				error: 'too many plans are waiting',
				message: `You already have ${waiting} plans waiting for the user. Ask them to decide those first.`,
			};
		}
	}
	// The row: the state of the decision. A null row means the same call is
	// already waiting — the index refuses the duplicate.
	const row = await insertApproval(ctx.db, {
		source,
		workspaceId: plan.data.target.workspaceId,
		tool: tool.name,
		args: plan.data.args,
		argsSha256: argsSha256(plan.data.args),
	});
	if (!row) {
		return {
			ok: false,
			error: 'the request is already waiting',
			message: 'This request is already waiting for the user. Do not ask again.',
		};
	}
	return { ok: true, row, plan: plan.data };
}
