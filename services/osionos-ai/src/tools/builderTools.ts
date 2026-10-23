import { normalisePlan } from '../builders/plan.ts';
import { checkPlan, planSchema, walkItems } from '../builders/planSchema.ts';
import type { Plan } from '../builders/planSchema.ts';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import type { ApprovalTarget } from '../approvals/types.ts';
import type { WriteTool } from './types.ts';
import { workspaceName, writablePage } from './writeTools.ts';

/**
 * The builder tool: a whole structure of new pages and databases, proposed
 * as ONE approval (devil C150). Like every write tool it writes nothing; and
 * until P6a-3 nothing can execute it (`bridgeWriteOf` answers null).
 */
export const buildPlan: WriteTool<Plan> = {
	name: 'build_plan',
	description:
		'Propose a whole structure of new pages and databases for the user to approve once. ' +
		'It can only CREATE new pages and databases, all under one parent (or the workspace root); it never edits existing ones. ' +
		'Page blocks: paragraph, heading_1-3, bulleted_list, numbered_list, to_do, toggle, quote, callout, divider, code, table_block, ' +
		'and database_inline / database_full_page pointing at a database key of the same plan. ' +
		'Database properties: title (exactly one), text, number, select, multi_select, status, date, checkbox, url, email, phone. ' +
		'Views: table, board, calendar, list, gallery. At most 40 items, 3 levels deep. ' +
		'Ids are assigned by the system: do not send any.',
	kind: 'write',
	verb: 'Build pages and databases',
	input: planSchema,
	async run(ctx, args) {
		const workspaces = await liveMemberWorkspaces(ctx.db, ctx.user);
		if (!workspaces.includes(args.workspaceId)) {
			return { ok: false, error: 'that workspace is not one of yours' };
		}
		if (args.parentPageId) {
			const parent = await writablePage(ctx, args.parentPageId);
			if (!parent) return { ok: false, error: 'no page with that id in your workspaces' };
		}
		const error = checkPlan(args);
		if (error) return { ok: false, error };
		const plan = normalisePlan(args);
		const target: ApprovalTarget = {
			title: args.title,
			workspaceId: args.workspaceId,
			workspaceName: await workspaceName(ctx.db, args.workspaceId),
		};
		return {
			ok: true,
			data: {
				args: { ...plan },
				target,
				preview: { unit: 'items', count: walkItems(plan.items).length },
			},
		};
	},
};
