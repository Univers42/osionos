import { createHash } from 'node:crypto';
import type { PlanDatabaseItem, PlanProperty } from './planSchema.ts';

/**
 * A plan database as the kit's object-database `state` slice, the body the app
 * POSTs to /api/object-databases ({ dbKey, title, state }).
 *
 * The interfaces below MIRROR the kit and are copied, not imported: the service
 * image does not carry the kit. They mirror, in
 * src/shared/notion-database-sys/packages/contract-types/src/index.ts:
 * SelectOption (~225), StatusGroup (139), SchemaProperty (~231), DatabaseSchema
 * (~269), Page (~313), Grouping (346), ViewConfig (~562), NotionState (~577).
 * tests/canvas/ai-builder-kit-slice.test.ts assigns this output to the kit's
 * own `NotionState` and loads it through the kit's store: that test, not this
 * comment, is what keeps the copies honest.
 *
 * Ids derive from the dbKey, so a retried create writes the same bytes (C156).
 * No formula/rollup/relation/button/custom config key is ever emitted (C152).
 *
 * Caveat: a row value that does not fit its property type is DROPPED, not
 * reported; a select value matches an option by exact text.
 */

interface KitSelectOption {
	id: string;
	value: string;
	color: string;
}
interface KitStatusGroup {
	id: string;
	label: string;
	color: string;
	optionIds: string[];
}
interface KitSchemaProperty {
	id: string;
	name: string;
	type: PlanProperty['type'];
	options?: KitSelectOption[];
	statusGroups?: KitStatusGroup[];
}
interface KitDatabaseSchema {
	id: string;
	name: string;
	properties: Record<string, KitSchemaProperty>;
	titlePropertyId: string;
	viewOrder: string[];
}
type KitValue = string | number | boolean | string[];
interface KitPage {
	id: string;
	databaseId: string;
	properties: Record<string, KitValue>;
	content: never[];
	createdAt: string;
	updatedAt: string;
	createdBy: string;
	lastEditedBy: string;
}
interface KitViewConfig {
	id: string;
	databaseId: string;
	name: string;
	type: 'table' | 'board' | 'calendar' | 'list' | 'gallery';
	filters: never[];
	filterConjunction: 'and';
	sorts: never[];
	grouping?: { propertyId: string };
	visibleProperties: string[];
	settings: { showCalendarBy?: string };
}
export interface KitState {
	databases: Record<string, KitDatabaseSchema>;
	pages: Record<string, KitPage>;
	views: Record<string, KitViewConfig>;
}
export interface KitSlice {
	dbKey: string;
	title: string;
	state: KitState;
}

/** The kit's tag palette (store/live/liveSchemaMapper.ts OPTION_COLORS). */
const OPTION_COLORS = [
	'bg-accent-muted text-accent-text-bold',
	'bg-success-surface-muted text-success-text-tag',
	'bg-warning-surface-muted text-warning-text-tag',
	'bg-danger-surface-muted text-danger-text-tag',
	'bg-violet-surface-muted text-violet-text-tag',
	'bg-cyan-surface-muted text-cyan-text-tag',
	'bg-pink-surface-muted text-pink-text-tag',
	'bg-surface-muted text-ink-strong',
];

/** The kit's three default status groups (store/slices/statusDefaults.ts). */
const STATUS_GROUPS = [
	{ suffix: 'sg-todo', label: 'To-do', color: 'bg-surface-muted text-ink-strong', names: ['not started', 'to-do', 'to do', 'todo'] },
	{ suffix: 'sg-progress', label: 'In Progress', color: 'bg-accent-subtle text-accent-text-bold', names: ['in progress'] },
	{ suffix: 'sg-complete', label: 'Complete', color: 'bg-success-surface-medium text-success-text-tag', names: ['done', 'complete'] },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const OPTION_TYPES: readonly string[] = ['select', 'multi_select', 'status'];

/** A v4-shaped uuid from the first 16 bytes of sha256(`${dbKey}:${index}`). */
export function rowUuid(dbKey: string, index: number): string {
	const bytes = createHash('sha256').update(`${dbKey}:${index}`).digest().subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x40;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildProperty(dbKey: string, property: PlanProperty, index: number): KitSchemaProperty {
	const id = `${dbKey}-p${index}`;
	const out: KitSchemaProperty = { id, name: property.name, type: property.type };
	if (!OPTION_TYPES.includes(property.type)) return out;
	const options = (property.options ?? []).map((value, i) => ({
		id: `${id}-o${i}`,
		value,
		color: OPTION_COLORS[i % OPTION_COLORS.length]!,
	}));
	out.options = options;
	if (property.type === 'status') {
		out.statusGroups = STATUS_GROUPS.map((group, g) => ({
			id: `${id}-${group.suffix}`,
			label: group.label,
			color: group.color,
			optionIds: options
				.filter((option) => {
					const named = STATUS_GROUPS.findIndex((other) => other.names.includes(option.value.toLowerCase()));
					return (named === -1 ? 0 : named) === g;
				})
				.map((option) => option.id),
		}));
	}
	return out;
}

function convertValue(property: KitSchemaProperty, value: string | number | boolean | null): KitValue | undefined {
	switch (property.type) {
		case 'title':
		case 'text':
		case 'url':
		case 'email':
		case 'phone':
			return typeof value === 'string' ? value : undefined;
		case 'number':
			return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
		case 'checkbox':
			return typeof value === 'boolean' ? value : undefined;
		case 'date':
			return typeof value === 'string' && ISO_DATE.test(value) ? value : undefined;
		case 'select':
		case 'status':
			return typeof value === 'string' ? property.options?.find((option) => option.value === value)?.id : undefined;
		case 'multi_select': {
			if (typeof value !== 'string') return undefined;
			const ids = value
				.split(',')
				.map((part) => property.options?.find((option) => option.value === part.trim())?.id)
				.filter((id): id is string => id !== undefined);
			return ids.length > 0 ? ids : undefined;
		}
	}
}

function buildView(dbKey: string, view: PlanDatabaseItem['views'][number], index: number, properties: KitSchemaProperty[]): KitViewConfig {
	const config: KitViewConfig = {
		id: `${dbKey}-v${index}`,
		databaseId: dbKey,
		name: view.name,
		type: view.type,
		filters: [],
		filterConjunction: 'and',
		sorts: [],
		visibleProperties: properties.map((property) => property.id),
		settings: {},
	};
	if (view.type === 'board') {
		const group = properties.find((property) => property.type === 'select' || property.type === 'status');
		if (group) config.grouping = { propertyId: group.id };
	}
	if (view.type === 'calendar') {
		const date = properties.find((property) => property.type === 'date');
		if (date) config.settings.showCalendarBy = date.id;
	}
	return config;
}

/** The plan database (with its minted dbKey) as a kit slice. Pure. */
export function kitSliceOf(database: PlanDatabaseItem, ctx: { userId: string; now: string }): KitSlice {
	const dbKey = database.dbKey;
	if (!dbKey) throw new Error('the database has no minted dbKey');
	const properties = database.properties.map((property, i) => buildProperty(dbKey, property, i));
	const byName = new Map(properties.map((property) => [property.name, property]));
	const title = properties.find((property) => property.type === 'title');
	if (!title) throw new Error('the database has no title property');

	const pages: Record<string, KitPage> = {};
	(database.rows ?? []).forEach((row, index) => {
		const id = rowUuid(dbKey, index);
		const values: Record<string, KitValue> = {};
		for (const [name, raw] of Object.entries(row.values)) {
			const property = byName.get(name);
			const value = property ? convertValue(property, raw) : undefined;
			if (property && value !== undefined) values[property.id] = value;
		}
		pages[id] = {
			id,
			databaseId: dbKey,
			properties: values,
			content: [],
			createdAt: ctx.now,
			updatedAt: ctx.now,
			createdBy: ctx.userId,
			lastEditedBy: ctx.userId,
		};
	});

	const views = database.views.map((view, i) => buildView(dbKey, view, i, properties));
	return {
		dbKey,
		title: database.title,
		state: {
			databases: {
				[dbKey]: {
					id: dbKey,
					name: database.title,
					properties: Object.fromEntries(properties.map((property) => [property.id, property])),
					titlePropertyId: title.id,
					viewOrder: views.map((view) => view.id),
				},
			},
			pages,
			views: Object.fromEntries(views.map((view) => [view.id, view])),
		},
	};
}
