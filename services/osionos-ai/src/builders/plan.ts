import { randomBytes, randomUUID } from 'node:crypto';
import { checkPlan, planSchema, walkItems } from './planSchema.ts';
import type { Plan, PlanItem } from './planSchema.ts';

/**
 * Ids of a plan, minted ONCE when the plan is stored (devil C156): a retried
 * item reuses its id, so the bridge can answer a repeat without a duplicate.
 */

function mint(items: readonly PlanItem[]): PlanItem[] {
	return items.map((item) =>
		item.kind === 'page'
			? { ...item, id: randomUUID(), ...(item.children ? { children: mint(item.children) } : {}) }
			: { ...item, dbKey: `db-${randomBytes(12).toString('hex')}` },
	);
}

/** The plan with a fresh id on every page and a fresh key on every database. */
export function normalisePlan(plan: Plan): Plan {
	return { ...plan, items: mint(plan.items) };
}

/** One entry of the flattened tree. */
export interface FlatItem {
	key: string;
	parentKey: string | null;
	kind: 'page' | 'database';
	depth: number;
}

/** The items in order, parents before children. Pure. */
export function flattenPlan(plan: Plan): FlatItem[] {
	const parents = new Map<PlanItem, string>();
	for (const { item } of walkItems(plan.items)) {
		if (item.kind === 'page') for (const child of item.children ?? []) parents.set(child, item.key);
	}
	return walkItems(plan.items).map(({ item, depth }) => ({
		key: item.key,
		parentKey: parents.get(item) ?? null,
		kind: item.kind,
		depth,
	}));
}

/**
 * The second validation of C151: the STORED args, parsed again with the same
 * schema and rules, and every minted id must be there. Never the model's text.
 */
export function revalidateStoredPlan(args: unknown): { ok: true; plan: Plan } | { ok: false; error: string } {
	const parsed = planSchema.safeParse(args);
	if (!parsed.success) return { ok: false, error: 'the stored plan does not fit the schema' };
	const error = checkPlan(parsed.data);
	if (error) return { ok: false, error };
	const ids = walkItems(parsed.data.items).map(({ item }) => (item.kind === 'page' ? item.id : item.dbKey));
	if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
		return { ok: false, error: 'the stored plan lacks its minted ids' };
	}
	return { ok: true, plan: parsed.data };
}
