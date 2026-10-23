import type { Pool } from 'pg';
import { writeTools } from '../tools/writeToolList.ts';
import { countExecutedInRun } from './repo.ts';
import type { ApprovalPlan, ApprovalRow, ApprovalTarget } from './types.ts';
import type { AuthUser } from '../auth.ts';

/**
 * The description of an approval: what the card shows, rebuilt from the row.
 *
 * The card must survive the fifteen minutes of the event stream: a client
 * that comes back later finds the approval in the database, and this is what
 * it draws. The description is RECOMPUTED from the real arguments — the tool
 * runs its plan again — so the card shows what the write WOULD do now, not a
 * summary the model wrote.
 *
 * A plan that fails (the caller lost the page in the meantime) does not hide
 * the approval: the arguments are still there, and the user still has to
 * decide.
 */

/** What the card shows of an approval. */
export interface ApprovalDescription {
	approvalId: string;
	tool: string;
	verb: string;
	status: string;
	target: ApprovalTarget;
	args: Record<string, unknown>;
	preview: ApprovalPlan['preview'];
	approvedInRun: number;
	expiresAt: string;
	createdAt: string;
}

/** The tool of an approval, by name. */
function toolOf(name: string) {
	return writeTools().find((tool) => tool.name === name) ?? null;
}

/**
 * The description of an approval, for its owner.
 *
 * The plan of the tool is run again, with the arguments of the row: the
 * target and the preview are what they are NOW, and the page may have moved
 * since the question was asked.
 */
export async function describeApproval(
	db: Pool,
	user: AuthUser,
	row: ApprovalRow,
): Promise<ApprovalDescription> {
	const tool = toolOf(row.tool);
	let plan: ApprovalPlan | null = null;
	if (tool) {
		const parsed = tool.input.safeParse(row.args ?? {});
		if (parsed.success) {
			const result = await tool.run({ db, user }, parsed.data);
			if (result.ok) plan = result.data;
		}
	}
	const args = (row.args ?? {}) as Record<string, unknown>;
	return {
		approvalId: row.id,
		tool: row.tool,
		verb: tool?.verb ?? row.tool,
		status: row.status,
		target: plan?.target ?? {
			title: typeof args.title === 'string' ? args.title : '',
			workspaceId: row.workspace_id,
			workspaceName: '',
		},
		args,
		preview: plan?.preview ?? { unit: 'none', count: 0 },
		approvedInRun: await countExecutedInRun(db, row.run_id),
		expiresAt: new Date(row.expires_at).toISOString(),
		createdAt: new Date(row.created_at).toISOString(),
	};
}
