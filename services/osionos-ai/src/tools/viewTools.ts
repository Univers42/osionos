import type { QueryResultRow } from 'pg';
import { z } from 'zod';
import { BUILTIN_AGENT_IDS } from '../agents/builtins.ts';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { canReadPageWithRules } from '../retrieval/shareRules.ts';
import type { AnyViewTool, ReadToolContext, ToolResult, ViewTool } from './types.ts';

/** The shape of a uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The panels the user may open. */
const PANELS = [
	'files', 'search', 'marketplace', 'agents', 'conversations', 'notifications',
	'tasks', 'public', 'database', 'scm', 'run', 'problems', 'issues',
] as const;

/** The arguments of open_page. */
const openPageArgs = z.object({
	pageId: z.unknown().optional().describe('the id of the page, a uuid'),
	target: z.unknown().optional().describe('where to open it: current, tab (the default) or split'),
});

/** The arguments of open_panel. */
const openPanelArgs = z.object({
	panel: z.unknown().optional().describe(`the panel: one of ${PANELS.join(', ')}`),
});

/** The arguments of open_issue_report. */
const openIssueReportArgs = z.object({
	title: z.unknown().optional().describe('a short title, at most 120 characters'),
	description: z.unknown().optional().describe('what the user saw and expected, at most 2000 characters'),
});

/** The arguments of suggest_agent. */
const suggestAgentArgs = z.object({
	agentId: z.unknown().optional().describe(`the agent: one of ${BUILTIN_AGENT_IDS.join(', ')}`),
	reason: z.unknown().optional().describe('why that agent fits better, at most 200 characters'),
});

/** The row of a page, as the read rule reads it. */
interface PageRow extends QueryResultRow {
	id: string;
	workspace_id: string;
	owner_id: string | null;
	visibility: string | null;
	collaborators: unknown;
	title: string | null;
}

/** The page sql: one row, by id. */
const PAGE_SQL = `
	select id, workspace_id, owner_id, visibility, collaborators, title
	from public.osionos_pages
	where id = $1::uuid and archived_at is null`;

const TARGETS = ['current', 'tab', 'split'] as const;

/** open_page: open a page in the user's view. */
export const openPage: ViewTool<z.infer<typeof openPageArgs>, { pageId: string; title: string; target: 'current' | 'tab' | 'split' }> = {
	name: 'open_page',
	description:
		'Open a page in the user\'s view: in the current tab, a new tab, or a split. Changes only what the user sees; editing stays with the write tools.',
	kind: 'view',
	input: openPageArgs,
	async run(ctx, args) {
		const pageId = typeof args.pageId === 'string' ? args.pageId.trim() : '';
		// A page that does not exist, and a page the caller may not read, are
		// the same thing (C210).
		if (!UUID.test(pageId)) {
			return { ok: false, error: 'no page with that id in your workspaces' };
		}
		const workspaces = await liveMemberWorkspaces(ctx.db, ctx.user);
		const result = await ctx.db.query<PageRow>(PAGE_SQL, [pageId]);
		const row = result.rows[0];
		if (!row || !(await canReadPageWithRules(ctx.db, ctx.user.userId, row, workspaces))) {
			return { ok: false, error: 'no page with that id in your workspaces' };
		}
		const targetRaw = typeof args.target === 'string' ? args.target : 'tab';
		const target = (TARGETS as readonly string[]).includes(targetRaw)
			? (targetRaw as 'current' | 'tab' | 'split')
			: 'tab';
		return {
			ok: true,
			data: { pageId: String(row.id), title: String(row.title ?? ''), target },
		};
	},
	render(data) {
		return `Opened "${data.title}".`;
	},
	sources() {
		return [];
	},
	view(data) {
		return { action: 'open_page', pageId: data.pageId, title: data.title, target: data.target };
	},
};

/** open_panel: open a panel in the user's view. */
export const openPanel: ViewTool<z.infer<typeof openPanelArgs>, { panel: (typeof PANELS)[number] }> = {
	name: 'open_panel',
	description: 'Open a panel in the user\'s view. Changes only what the user sees.',
	kind: 'view',
	input: openPanelArgs,
	async run(_ctx, args) {
		const panel = typeof args.panel === 'string' ? args.panel : '';
		if (!(PANELS as readonly string[]).includes(panel)) {
			return { ok: false, error: 'the panel must be one of the known panels' };
		}
		return { ok: true, data: { panel: panel as (typeof PANELS)[number] } };
	},
	render(data) {
		return `Opened the ${data.panel} panel.`;
	},
	sources() {
		return [];
	},
	view(data) {
		return { action: 'open_panel', panel: data.panel };
	},
};

/** open_issue_report: open the issue report dialog, prefilled. */
export const openIssueReport: ViewTool<z.infer<typeof openIssueReportArgs>, { title: string; description: string }> = {
	name: 'open_issue_report',
	description:
		'Open the issue report dialog, prefilled with a title and a description. The user reviews and sends it. Changes only what the user sees.',
	kind: 'view',
	input: openIssueReportArgs,
	async run(_ctx, args) {
		const title = typeof args.title === 'string' ? args.title.trim() : '';
		const description = typeof args.description === 'string' ? args.description.trim() : '';
		if (title.length < 1 || title.length > 120) {
			return { ok: false, error: 'the title must be between 1 and 120 characters' };
		}
		if (description.length < 1 || description.length > 2000) {
			return { ok: false, error: 'the description must be between 1 and 2000 characters' };
		}
		return { ok: true, data: { title, description } };
	},
	render(data) {
		return `Opened the issue report dialog, prefilled with "${data.title}".`;
	},
	sources() {
		return [];
	},
	view(data) {
		return { action: 'open_issue_report', title: data.title, description: data.description };
	},
};

/** Control and format characters (bidi marks, zero-width): a reason is shown to the user as plain text. */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/** suggest_agent: offer the user a hand-off to another built-in agent. */
export const suggestAgent: ViewTool<z.infer<typeof suggestAgentArgs>, { agentId: string; reason: string }> = {
	name: 'suggest_agent',
	description:
		'Suggest that another agent answers better: the user sees a chip and may click it. Changes nothing by itself. Built-in agents only.',
	kind: 'view',
	input: suggestAgentArgs,
	async run(ctx, args) {
		const agentId = typeof args.agentId === 'string' ? args.agentId : '';
		// A custom agent id is refused too: a hand-off to one is out of scope in v1.
		if (!(BUILTIN_AGENT_IDS as readonly string[]).includes(agentId)) {
			return { ok: false, error: `the agent must be one of ${BUILTIN_AGENT_IDS.join(', ')}` };
		}
		if (agentId === ctx.agentId) return { ok: false, error: 'You are already that agent.' };
		const reason = (typeof args.reason === 'string' ? args.reason : '').replace(INVISIBLE, '').trim();
		if (reason.length < 1 || reason.length > 200) {
			return { ok: false, error: 'the reason must be between 1 and 200 characters' };
		}
		return { ok: true, data: { agentId, reason } };
	},
	render(data) {
		return `Suggested the ${data.agentId} agent to the user.`;
	},
	sources() {
		return [];
	},
	view(data) {
		return { action: 'suggest_agent', agentId: data.agentId, reason: data.reason };
	},
};

/** The view tools, in the order the model sees them. */
export const VIEW_TOOLS: readonly AnyViewTool[] = Object.freeze([openPage, openPanel, openIssueReport, suggestAgent]);