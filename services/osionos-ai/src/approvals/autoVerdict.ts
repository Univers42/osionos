import { config } from '../config.ts';
import { modesAllowed } from '../modes/modesConfig.ts';
import { narrower, readConversationMode, writeRank } from '../modes/mode.ts';
import type { StoredMode } from '../modes/mode.ts';
import { isAutoEligible } from '../modes/eligibility.ts';
import { conversationTaint } from '../provenance/repo.ts';
import { targetOf } from '../modes/targetPage.ts';
import { inAnchorSubtree, liveWorkspaceOf } from '../modes/anchor.ts';
import { checkAutoWriteRate, countAutoInTurn, takeDailyAuto } from '../modes/autoLimits.ts';
import type { AutoGate } from '../modes/autoGate.ts';
import type { ApprovalRow, CardReason, DecidedBy } from './types.ts';

/**
 * Whether an auto mode may apply this write itself, or a human decides.
 *
 * Caveat: the checks run in a fixed order, so the card names the first failing
 * reason only. A tainted conversation outside the anchor shows `tainted`. The
 * last three checks spend a counter (the step, the minute, the day) even when
 * a later one refuses, so a refused write still counts against them.
 */
export type AutoVerdict = { kind: 'apply'; decidedBy: Extract<DecidedBy, 'auto:accept_edits' | 'auto:auto'> } | { kind: 'card'; reason: CardReason };

/** What the checks share: the clock, and the mode after the narrowing of the live row. */
interface Run {
	nowMs: number;
	mode: StoredMode;
}

type Check = (g: AutoGate, row: ApprovalRow, run: Run) => CardReason | null | Promise<CardReason | null>;

const sameWorkspace = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const snapshotRank: Check = (g) => (writeRank(g.snapshot.mode) > 0 ? null : 'mode_manual');
const allowlisted: Check = (g) => (modesAllowed(config, g.user.userId) ? null : 'not_allowlisted');
const eligible: Check = (_g, row) => (isAutoEligible(row.tool) ? null : 'tool_not_eligible');

/** AM10: the live row may narrow the run's mode, never widen it; a failed read narrows to manual. */
const liveMode: Check = async (g, _row, run) => {
	const live = await readConversationMode(g.db, g.conversationId, g.user.userId).catch(() => null);
	if (!live) return 'mode_manual';
	const effective = narrower(g.snapshot, live);
	if (writeRank(effective.mode) === 0) return writeRank(live.mode) === 0 ? 'mode_manual' : 'mode_changed';
	run.mode = effective;
	return null;
};

const untainted: Check = async (g) => {
	await Promise.allSettled([...g.reads]);
	return (await conversationTaint(g.db, g.conversationId)).tainted ? 'tainted' : null;
};

/** AM12: the page a write touches, read live, must be in the run's workspace. */
const inWorkspace: Check = async (g, row, run) => {
	const target = targetOf(row);
	if (!target) return run.mode.mode === 'auto' ? 'outside_workspace' : 'no_anchor';
	const live = await liveWorkspaceOf(g.db, target.pageId);
	if (live === null || !sameWorkspace(live, g.workspaceId)) return 'outside_workspace';
	const asked = row.tool === 'create_page' ? row.args.workspaceId : g.workspaceId;
	return typeof asked === 'string' && sameWorkspace(asked, g.workspaceId) ? null : 'outside_workspace';
};

/** AM11: accept_edits writes only under its anchor; auto has none. */
const underAnchor: Check = async (g, row, run) => {
	if (run.mode.mode !== 'accept_edits') return null;
	const target = targetOf(row);
	if (!run.mode.anchorPageId || !target) return 'no_anchor';
	return (await inAnchorSubtree(g.db, target.pageId, run.mode.anchorPageId)) ? null : 'outside_anchor';
};

const credentialUsable: Check = (g, _row, run) => {
	if (!g.credential) return 'no_credential';
	return g.credential.usable(run.nowMs) ? null : 'credential_expiring';
};

const roomToClaim: Check = (g, _row, run) => (g.budget.canClaim(run.nowMs) ? null : 'budget_low');
const stepRoom: Check = (g) => (g.step.take() ? null : 'step_cap');
const turnRoom: Check = async (g) => ((await countAutoInTurn(g.db, g.turnId)) < config.autoPerTurn ? null : 'turn_cap');
const rateRoom: Check = async (g, _row, run) =>
	(await checkAutoWriteRate(g.redis, g.user.userId, new Date(run.nowMs))).allowed ? null : 'rate_limited';
// Last: it increments even when it refuses.
const dayRoom: Check = async (g, _row, run) => ((await takeDailyAuto(g.redis, g.user.userId, new Date(run.nowMs))).allowed ? null : 'day_cap');

const CHECKS: readonly Check[] = [
	snapshotRank, allowlisted, eligible, liveMode, untainted, inWorkspace, underAnchor,
	credentialUsable, roomToClaim, stepRoom, turnRoom, rateRoom, dayRoom,
];

export async function autoVerdict(g: AutoGate, row: ApprovalRow, nowMs: number): Promise<AutoVerdict> {
	const run: Run = { nowMs, mode: g.snapshot };
	for (const check of CHECKS) {
		const reason = await check(g, row, run);
		if (reason) return { kind: 'card', reason };
	}
	return { kind: 'apply', decidedBy: run.mode.mode === 'auto' ? 'auto:auto' : 'auto:accept_edits' };
}
