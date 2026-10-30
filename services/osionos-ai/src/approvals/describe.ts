import type { Pool } from 'pg';
import { writeTools } from '../tools/writeToolList.ts';
import { cardAgentOfRun } from '../agents/card.ts';
import type { CardAgent } from '../agents/card.ts';
import { getRun } from '../runs/repo.ts';
import { countExecutedInRun } from './repo.ts';
import type { ApprovalPlan, ApprovalRow, ApprovalTarget, McpCard } from './types.ts';
import type { AuthUser } from '../auth.ts';
import { config } from '../config.ts';
import { cardOf, readStoredCall } from '../mcpClient/card.ts';
import { getToolNow } from '../mcpClient/repo.ts';
import { influencedBy } from '../mcpClient/taint.ts';
import { allItems } from '../builders/items.ts';

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
	/** What the write came to, in the words execution recorded: "… (page version N)" (C239). */
	summary: string | null;
	/** The card of an MCP call, rebuilt from the stored row (C281). */
	mcp?: McpCard & { changed: boolean };
	influencedBy?: string[];
	/** The agent of the run, from its pin (C304); null for the general assistant. */
	agent: CardAgent | null;
	/** A build plan's items, parents first, as execution records them (#79); absent before the decision. */
	progress?: { key: string; kind: string; status: string }[];
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
	if (row.tool === 'mcp_call') return describeMcp(db, row);
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
		summary: summaryOf(row.result),
		...(await taint(db, row)),
		...(await progress(db, row)),
		agent: await cardAgentOfRun(db, row.run_id ? await getRun(db, row.run_id) : null),
	};
}

/**
 * The items of a build plan: the decision request writes each one's state as it goes
 * (C157), so a card that reads this while the request runs sees the build advance.
 */
async function progress(db: Pool, row: ApprovalRow): Promise<Pick<ApprovalDescription, 'progress'>> {
	if (row.tool !== 'build_plan') return {};
	const items = await allItems(db, row.id);
	if (items.length === 0) return {};
	return { progress: items.map((item) => ({ key: item.item_key, kind: item.kind, status: item.status })) };
}

async function taint(db: Pool, row: ApprovalRow): Promise<{ influencedBy?: string[] }> {
	if (!(config.mcpClientEnabled || config.webEnabled) || row.origin !== 'run' || !row.conversation_id) return {};
	const labels = await influencedBy(db, row.conversation_id);
	return labels.length > 0 ? { influencedBy: labels } : {};
}

/**
 * An MCP call, drawn from the row alone: the words the user agreed to are the
 * stored ones. `changed` tells the client the tool no longer matches them, so
 * approving would be refused (C272).
 */
async function describeMcp(db: Pool, row: ApprovalRow): Promise<ApprovalDescription> {
	const call = readStoredCall(row.args);
	const now = call ? await getToolNow(db, call.serverId, row.owner_id, call.toolName) : null;
	return {
		approvalId: row.id,
		tool: row.tool,
		verb: call ? `Call ${call.toolName} on ${call.serverLabel}` : row.tool,
		status: row.status,
		target: { title: call?.toolName ?? '', workspaceId: row.workspace_id, workspaceName: '' },
		args: call?.arguments ?? {},
		preview: { unit: 'none', count: 0 },
		approvedInRun: await countExecutedInRun(db, row.run_id),
		expiresAt: new Date(row.expires_at).toISOString(),
		createdAt: new Date(row.created_at).toISOString(),
		summary: summaryOf(row.result),
		...(call ? { mcp: { ...cardOf(call), changed: !now || !now.enabled || now.snapshot_sha256 !== call.snapshotSha256 } } : {}),
		...(await taint(db, row)),
		agent: await cardAgentOfRun(db, row.run_id ? await getRun(db, row.run_id) : null),
	};
}

/** The sentence execution recorded, when it recorded one. */
function summaryOf(result: unknown): string | null {
	const summary = (result as { summary?: unknown } | null)?.summary;
	return typeof summary === 'string' ? summary : null;
}
