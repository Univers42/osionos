import type { Pool } from 'pg';
import { config } from '../config.ts';
import { bridgeWrite, bridgeRead, refusalMessage, BRIDGE_TIMEOUT_MS } from '../approvals/bridge.ts';
import type { BridgeAnswer } from '../approvals/bridge.ts';
import type { AuthUser } from '../auth.ts';
import type { ApprovalRow } from '../approvals/types.ts';
import { liveMemberWorkspaces } from '../retrieval/acl.ts';
import { writablePage } from '../tools/writeTools.ts';
import type { WriteToolContext } from '../tools/types.ts';
import { flattenPlan, type FlatItem } from './plan.ts';
import { walkItems as walkPlanItems } from './planSchema.ts';
import type { Plan, PlanItem } from './planSchema.ts';
import { kitSliceOf, rowUuid } from './kitSlice.ts';
import { pendingItems, allItems, setItem } from './items.ts';

/**
 * The execution of an approved plan (devil C154-C158).
 */

export class UnknownItemError extends Error {
	code = 'unknown_item';
}

/** The result of one execution pass. */
export interface ExecutePlanResult {
	done: number;
	failed: number;
	skipped: number;
	pending: number;
	counts: { done: number; failed: number; skipped: number; pending: number };
	created: { key: string; kind: string; id: string }[];
}

/** Which keys are approved: a key only if it is requested and every ancestor is. */
export function approvedKeys(flat: readonly FlatItem[], requested?: string[]): string[] {
	if (!requested) return flat.map((item) => item.key);
	const requestedSet = new Set(requested);
	// An unknown key is a 400, not a silent skip.
	for (const key of requested) {
		if (!flat.some((item) => item.key === key)) throw new UnknownItemError(key);
	}
	const byKey = new Map(flat.map((f) => [f.key, f]));
	const approved = new Set<string>();
	// Parents first: an item is approved only when all of its ancestors are.
	for (const item of flat) {
		if (!requestedSet.has(item.key)) continue;
		let ok = true;
		let parentKey = item.parentKey;
		while (parentKey) {
			if (!requestedSet.has(parentKey)) {
				ok = false;
				break;
			}
			const parent = byKey.get(parentKey);
			parentKey = parent?.parentKey ?? null;
		}
		if (ok) approved.add(item.key);
	}
	return flat.filter((item) => approved.has(item.key)).map((item) => item.key);
}

/** The BridgeWrite of one item. */
export function writeOf(
	plan: Plan,
	item: FlatItem,
	ctx?: { userId?: string; now?: string | number | Date; approvalCreatedAt?: string | number | Date },
): { method: 'POST'; path: string; body: Record<string, unknown> } {
	const userId = ctx?.userId ?? '';
	let nowIso = '';
	const raw = ctx?.approvalCreatedAt ?? ctx?.now;
	if (raw instanceof Date) nowIso = raw.toISOString();
	else if (typeof raw === 'number') nowIso = new Date(raw).toISOString();
	else if (typeof raw === 'string' && raw.length > 0) nowIso = raw;
	else nowIso = new Date().toISOString();

	const planItem = findPlanItem(plan, item.key);
	if (item.kind === 'page') {
		const page = planItem as Extract<PlanItem, { kind: 'page' }>;
		const parentPageId =
			item.parentKey !== null
				? (findPlanItem(plan, item.parentKey) as Extract<PlanItem, { kind: 'page' }>)?.id
				: plan.parentPageId;
		const blocks = page.blocks ?? [];
		const content = blocks.map((block, i) => {
			if ('databaseKey' in block) {
				const dbKey = block.databaseKey;
				return {
					id: rowUuid(`${page.id}:block`, i),
					type: 'database_inline',
					content: '',
					databaseId: dbKey,
					viewId: `${dbKey}-v0`,
				};
			}
			return {
				id: rowUuid(`${page.id}:block`, i),
				type: block.type,
				content: block.content,
			};
		});
		const body: Record<string, unknown> = {
			id: page.id,
			workspaceId: plan.workspaceId,
			title: page.title,
			content,
		};
		if (parentPageId) body.parentPageId = parentPageId;
		return { method: 'POST', path: '/api/pages', body };
	}

	const database = planItem as Extract<PlanItem, { kind: 'database' }>;
	const slice = kitSliceOf(database, { userId, now: nowIso });
	return {
		method: 'POST',
		path: '/api/object-databases',
		body: {
			dbKey: database.dbKey,
			title: database.title,
			workspaceId: plan.workspaceId,
			ifAbsent: true,
			state: slice.state,
		},
	};
}

/** Classify a bridge answer for one item. */
export function classify(
	kind: 'page' | 'database',
	answer: BridgeAnswer,
	id?: string,
): { status: 'done' | 'pending' | 'failed'; createdId?: string; error?: string } {
	const isRetryable =
		answer.status === 0 || answer.status === 408 || answer.status === 429 || answer.status >= 500;
	if (kind === 'page') {
		if (answer.ok) return { status: 'done', createdId: id };
		if (isRetryable) return { status: 'pending', error: refusalMessage(answer) };
		return { status: 'failed', error: refusalMessage(answer) };
	}
	// database
	const dbExists =
		answer.status === 409 && /db_exists/.test(answer.body);
	if (answer.ok || dbExists) return { status: 'done', createdId: id };
	if (isRetryable) return { status: 'pending', error: refusalMessage(answer) };
	return { status: 'failed', error: refusalMessage(answer) };
}

/** Execute the pending items of a plan, in position order. */
export async function executePlan(input: {
	db: Pool;
	user: AuthUser;
	sessionToken: string;
	approval: ApprovalRow;
	plan: Plan;
	budgetMs?: number;
	now?: () => number;
}): Promise<ExecutePlanResult> {
	const { db, user, sessionToken, approval, plan } = input;
	const budgetMs = input.budgetMs ?? config.buildBudgetMs;
	const now = input.now ?? Date.now;
	const started = now();

	const counts = { done: 0, failed: 0, skipped: 0, pending: 0 };
	const created: { key: string; kind: string; id: string }[] = [];

	// Live authority first.
	const ctx: WriteToolContext = { db, user };
	const workspaces = await liveMemberWorkspaces(db, user);
	let writable = workspaces.includes(plan.workspaceId);
	if (writable && plan.parentPageId) {
		const page = await writablePage(ctx, plan.parentPageId);
		if (!page) writable = false;
	}
	if (!writable) {
		const pending = await pendingItems(db, approval.id);
		for (const row of pending) {
			await setItem(db, approval.id, row.item_key, 'failed', null, 'the workspace is not writable by you');
		}
		const all = await allItems(db, approval.id);
		for (const row of all) {
			if (row.status === 'done') counts.done++;
			else if (row.status === 'failed') counts.failed++;
			else if (row.status === 'skipped') counts.skipped++;
			else counts.pending++;
		}
		return { ...counts, counts: { ...counts }, created };
	}

	const flat = flattenPlan(plan);
	const flatByKey = new Map(flat.map((f) => [f.key, f]));
	const planByKey = new Map(walkPlanItems(plan.items).map((w) => [w.item.key, w.item]));
	const bridgeUrl = config.bridgeUrl;

	const rows = await pendingItems(db, approval.id);
	for (const row of rows) {
		if (now() - started >= budgetMs) break;
		const f = flatByKey.get(row.item_key);
		if (!f) continue;

		// parent handling
		const parentKey = f.parentKey;
		if (parentKey) {
			const all = await allItems(db, approval.id);
			const parentRow = all.find((r) => r.item_key === parentKey);
			const parentStatus = parentRow?.status;
			if (parentStatus === 'pending') {
				// stays pending
				continue;
			}
			if (parentStatus === 'failed' || parentStatus === 'skipped') {
				await setItem(db, approval.id, f.key, 'failed', null, 'its parent was not created');
				continue;
			}
		}

		const planItem = planByKey.get(f.key)!;
		const id = f.kind === 'page' ? (planItem as { id: string }).id : (planItem as { dbKey: string }).dbKey;
		const remaining = budgetMs - (now() - started);
		const timeout = Math.min(BRIDGE_TIMEOUT_MS, Math.max(1, remaining));

		// Probe a page that was tried before: its answer may have been lost.
		if (f.kind === 'page' && row.error !== null && bridgeUrl) {
			const probe = await bridgeRead({ url: bridgeUrl, token: sessionToken, path: `/api/pages/${id}`, timeoutMs: timeout });
			let parsed: { workspaceId?: unknown } = {};
			try {
				parsed = JSON.parse(probe.body) as { workspaceId?: unknown };
			} catch {
				parsed = {};
			}
			if (probe.status === 200 && parsed.workspaceId === plan.workspaceId) {
				await setItem(db, approval.id, f.key, 'done', id, null);
				created.push({ key: f.key, kind: f.kind, id });
				continue;
			}
			if (probe.status !== 404) {
				// 0, 5xx, 429, ... : leave pending with the probe's error.
				await setItem(db, approval.id, f.key, 'pending', null, refusalMessage(probe));
				continue;
			}
			// 404: fall through to POST.
		}

		const writeCtx = {
			userId: user.userId,
			now: approval.created_at instanceof Date ? approval.created_at.toISOString() : String(approval.created_at),
		};
		const write = writeOf(plan, f, writeCtx);
		let answer: BridgeAnswer;
		if (!bridgeUrl) {
			answer = { ok: false, status: 0, body: '' };
		} else {
			answer = await bridgeWrite({ url: bridgeUrl, token: sessionToken, write, timeoutMs: timeout });
		}
		const cls = classify(f.kind as 'page' | 'database', answer, id);
		if (cls.status === 'done') {
			await setItem(db, approval.id, f.key, 'done', cls.createdId ?? id, null);
			created.push({ key: f.key, kind: f.kind, id: cls.createdId ?? id });
		} else if (cls.status === 'pending') {
			await setItem(db, approval.id, f.key, 'pending', null, cls.error ?? null);
		} else {
			await setItem(db, approval.id, f.key, 'failed', null, cls.error ?? null);
		}
	}

	const all = await allItems(db, approval.id);
	for (const row of all) {
		if (row.status === 'done') counts.done++;
		else if (row.status === 'failed') counts.failed++;
		else if (row.status === 'skipped') counts.skipped++;
		else counts.pending++;
	}
	return { ...counts, counts: { ...counts }, created };
}

function findPlanItem(plan: Plan, key: string): PlanItem {
	for (const { item } of walkPlanItems(plan.items)) {
		if (item.key === key) return item;
	}
	throw new Error(`unknown plan item ${key}`);
}

