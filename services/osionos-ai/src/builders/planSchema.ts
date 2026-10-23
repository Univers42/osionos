import { z } from 'zod';

/**
 * The schema of a builder plan: pages, databases, views and rows to CREATE.
 *
 * The schema is the whitelist (devil C151): unknown keys are stripped, so a
 * `src`, a `buttonConfig` or a `formula` the model adds never reaches a row.
 * The plan is validated twice, with the same code: at proposal, and from the
 * STORED row before anything runs (`revalidateStoredPlan`).
 *
 * Caveat: `checkPlan` reports the FIRST error only, and the size cap counts
 * the JSON of the args (UTF-8 bytes), not what the bridge will store.
 */

/**
 * The allow-lists are a subset ON PURPOSE (C152, C153). Each refused group
 * is refused for a reason:
 *  - `button`: its actions include webhook and open_url
 *    (src/shared/notion-database-sys/packages/contract-types/src/index.ts:156-163);
 *  - `formula`: an evaluated expression;
 *  - `relation` / `rollup`: can point at a database outside the plan;
 *  - `person` / `user` / `files_media`: identities and uploads, not plain data;
 *  - `image` / `video` / `audio` / `file` / embed blocks: remote media is an
 *    exfiltration beacon (the viewer's browser fetches the URL);
 *  - the `dashboard` view is P6b (C165);
 *  - the `chart` view draws nothing until `settings.xAxisProperty` is set
 *    (kit views/chart/useChartData.ts:26-31, ChartView.tsx:98), a choice the
 *    plan does not carry. Re-add it once the plan names its axis.
 */
export const PLAN_BLOCK_TYPES = [
	'paragraph',
	'heading_1',
	'heading_2',
	'heading_3',
	'bulleted_list',
	'numbered_list',
	'to_do',
	'toggle',
	'quote',
	'callout',
	'divider',
	'code',
	'table_block',
] as const;

export const PLAN_PROPERTY_TYPES = [
	'title',
	'text',
	'number',
	'select',
	'multi_select',
	'status',
	'date',
	'checkbox',
	'url',
	'email',
	'phone',
] as const;

export const PLAN_VIEW_TYPES = ['table', 'board', 'calendar', 'list', 'gallery'] as const;

/** The block types that point at a database of the same plan. */
const DATABASE_BLOCK_TYPES = ['database_inline'] as const;

/** The property types that take a list of options. */
const OPTION_PROPERTY_TYPES: readonly string[] = ['select', 'multi_select', 'status'];

export const MAX_PLAN_ITEMS = 40;
export const MAX_PLAN_DEPTH = 3;
/** The stored args of a plan: bigger than an ordinary approval (64 KB). */
export const MAX_PLAN_ARGS_BYTES = 256 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DB_KEY = /^db-[0-9a-f]{24}$/;

const keySchema = z.string().regex(/^[a-z0-9-]{1,40}$/);
const titleSchema = z.string().min(1).max(200);
const nameSchema = z.string().min(1).max(80);

const textBlock = z.object({
	type: z.enum(PLAN_BLOCK_TYPES),
	content: z.string().max(10_000),
});
const databaseBlock = z.object({
	type: z.enum(DATABASE_BLOCK_TYPES),
	databaseKey: keySchema,
});
const blockSchema = z.union([textBlock, databaseBlock]);

const propertySchema = z.object({
	name: nameSchema,
	type: z.enum(PLAN_PROPERTY_TYPES),
	options: z.array(z.string().min(1).max(60)).max(30).optional(),
});

const viewSchema = z.object({ type: z.enum(PLAN_VIEW_TYPES), name: nameSchema });

const rowSchema = z.object({
	values: z
		.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
		.refine((values) => Object.keys(values).length <= 12),
});

/** `id` and `dbKey` are minted by `normalisePlan`; the model's own are overwritten. */
const pageItemBase = z.object({
	kind: z.literal('page'),
	key: keySchema,
	id: z.string().regex(UUID).optional(),
	title: titleSchema,
	blocks: z.array(blockSchema).max(100).optional(),
});

const databaseItem = z.object({
	kind: z.literal('database'),
	key: keySchema,
	dbKey: z.string().regex(DB_KEY).optional(),
	title: titleSchema,
	properties: z.array(propertySchema).min(1).max(12),
	views: z.array(viewSchema).min(1).max(4),
	rows: z.array(rowSchema).max(50).optional(),
});

export type PlanBlock = z.infer<typeof blockSchema>;
export type PlanProperty = z.infer<typeof propertySchema>;
export type PlanDatabaseItem = z.infer<typeof databaseItem>;
export type PlanPageItem = z.infer<typeof pageItemBase> & { children?: PlanItem[] };
export type PlanItem = PlanPageItem | PlanDatabaseItem;

const pageItem: z.ZodType<PlanPageItem> = pageItemBase.extend({
	children: z.lazy(() => z.array(itemSchema).max(MAX_PLAN_ITEMS).optional()),
});
const itemSchema: z.ZodType<PlanItem> = z.lazy(() => z.union([pageItem, databaseItem]));

export const planSchema = z.object({
	workspaceId: z.string().regex(UUID),
	parentPageId: z.string().regex(UUID).optional(),
	title: titleSchema,
	items: z.array(itemSchema).min(1).max(MAX_PLAN_ITEMS),
});
export type Plan = z.infer<typeof planSchema>;

/** Every item of the tree with its depth (roots are 1), parents first. */
export function walkItems(items: readonly PlanItem[], depth = 1): { item: PlanItem; depth: number }[] {
	const out: { item: PlanItem; depth: number }[] = [];
	for (const item of items) {
		out.push({ item, depth });
		if (item.kind === 'page' && item.children) out.push(...walkItems(item.children, depth + 1));
	}
	return out;
}

/** The first error in the shape of the tree, or null. */
function treeError(all: { item: PlanItem; depth: number }[]): string | null {
	if (all.length > MAX_PLAN_ITEMS) return `a plan holds at most ${MAX_PLAN_ITEMS} items`;
	if (all.some(({ depth }) => depth > MAX_PLAN_DEPTH)) return `a plan is at most ${MAX_PLAN_DEPTH} levels deep`;
	const keys = new Set<string>();
	for (const { item } of all) {
		if (keys.has(item.key)) return `the key "${item.key}" is used twice`;
		keys.add(item.key);
	}
	return null;
}

/** The first error in one database item (its properties and rows), or null. */
function databaseError(db: PlanDatabaseItem): string | null {
	const titles = db.properties.filter((property) => property.type === 'title').length;
	if (titles !== 1) return `the database "${db.key}" needs exactly one title property`;
	const names = new Set(db.properties.map((property) => property.name));
	if (names.size !== db.properties.length) return `the database "${db.key}" repeats a property name`;
	for (const property of db.properties) {
		if (property.options && !OPTION_PROPERTY_TYPES.includes(property.type)) {
			return 'only select, multi_select and status properties take options';
		}
	}
	const types = new Set(db.properties.map((property) => property.type));
	for (const view of db.views) {
		if (view.type === 'board' && !types.has('select') && !types.has('status')) {
			return `the board "${view.name}" of "${db.key}" needs a select or status property`;
		}
		if (view.type === 'calendar' && !types.has('date')) {
			return `the calendar "${view.name}" of "${db.key}" needs a date property`;
		}
	}
	for (const row of db.rows ?? []) {
		for (const name of Object.keys(row.values)) {
			if (!names.has(name)) return `a row of "${db.key}" names the unknown property "${name}"`;
		}
	}
	return null;
}

/**
 * The rules the shape cannot say: counts over the tree, unique keys,
 * databaseKey references, rows and title properties, and the stored size.
 * Returns the first error, or null.
 */
export function checkPlan(plan: Plan): string | null {
	const all = walkItems(plan.items);
	const shape = treeError(all);
	if (shape) return shape;
	const databaseKeys = new Set(all.filter(({ item }) => item.kind === 'database').map(({ item }) => item.key));
	const referencedDbs = new Set<string>();
	for (const { item } of all) {
		if (item.kind === 'page') {
			for (const block of item.blocks ?? []) {
				if ('databaseKey' in block) referencedDbs.add(block.databaseKey);
			}
		}
	}
	for (const { item } of all) {
		if (item.kind === 'database') {
			const error = databaseError(item);
			if (error) return error;
			if (!referencedDbs.has(item.key)) {
				return `the database "${item.key}" is shown by no page: add a database_inline block that points at it`;
			}
			continue;
		}
		for (const block of item.blocks ?? []) {
			if ('databaseKey' in block && !databaseKeys.has(block.databaseKey)) {
				return `the block points at "${block.databaseKey}", which is no database of this plan`;
			}
		}
	}
	if (Buffer.byteLength(JSON.stringify(plan), 'utf8') > MAX_PLAN_ARGS_BYTES) return 'the plan is too big';
	return null;
}
