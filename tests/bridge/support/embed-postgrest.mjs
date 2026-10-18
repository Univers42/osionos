/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-postgrest.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A strict evaluator for the PostgREST resource-embedding reads the membership statements
// emit (ADR 0004): members -> workspace -> pages and pages -> workspace -> members. It
// implements exactly those shapes and THROWS on anything else, so a new embed, filter,
// operator, column or an unhinted relationship fails a test instead of matching every row.
// Differences from the permissive harness it plugs into: `is.null` is true only for a
// column the table declares (a missing key on an undeclared column throws), and a nested
// filter is applied to the embedded rows only, as PostgREST does.
// Caveat: eq/gt compare case-insensitively (right for uuid columns, wrong for text columns
// differing only by case); to-one embeds resolve through the seeded osionos_workspaces table.

const TABLE_COLUMNS = {
	osionos_workspaces: ['id'],
	osionos_workspace_members: ['workspace_id', 'user_id', 'role', 'permissions'],
	osionos_pages: [
		'id', 'title', 'icon', 'cover', 'cover_position', 'updated_at', 'created_at', 'workspace_id', 'owner_id',
		'visibility', 'collaborators', 'parent_page_id', 'sort_order', 'database_id', 'archived_at', 'properties',
		'surface', 'is_template', 'is_default_template', 'template_surface', 'recurrence', 'content',
	],
};

// FK column on the child table; `toOne` embeds the single parent, otherwise the child rows.
const RELATIONS = {
	osionos_workspace_members: { osionos_workspaces: { column: 'workspace_id', toOne: true } },
	osionos_pages: { osionos_workspaces: { column: 'workspace_id', toOne: true } },
	osionos_workspaces: {
		osionos_pages: { column: 'workspace_id', toOne: false },
		osionos_workspace_members: { column: 'workspace_id', toOne: false },
	},
};

const same = (left, right) => left != null && String(left).toLowerCase() === String(right).toLowerCase();

function fail(message) {
	throw new Error(`embed postgrest: ${message}`);
}

function splitTop(text) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] === '(') depth += 1;
		if (text[index] === ')') depth -= 1;
		if (text[index] === ',' && depth === 0) {
			parts.push(text.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(text.slice(start));
	return parts;
}

const EMBED_ITEM = /^([a-z_]+):([a-z_]+)!([a-z_]+)\((.*)\)$/s;

function parseSelect(select) {
	return splitTop(select).map((item) => {
		if (!item.includes('(')) return { column: item };
		const match = EMBED_ITEM.exec(item);
		if (!match) fail(`unsupported select item "${item}" (embeds need alias:table!fk_column(...))`);
		return { alias: match[1], table: match[2], hint: match[3], inner: parseSelect(match[4]) };
	});
}

function declared(table, column) {
	if (!TABLE_COLUMNS[table]?.includes(column)) fail(`column ${table}.${column} is not declared`);
}

function matches(row, table, column, expression) {
	declared(table, column);
	if (expression === 'is.null') return row[column] == null;
	if (expression.startsWith('eq.')) return same(row[column], expression.slice(3));
	if (expression.startsWith('gt.')) return row[column] != null && String(row[column]).toLowerCase() > expression.slice(3).toLowerCase();
	return fail(`unsupported operator ${table}.${column}=${expression}`);
}

function ordered(rows, table, order) {
	if (order === undefined) return rows;
	if (order === 'id.asc') return [...rows].sort((left, right) => (String(left.id).toLowerCase() < String(right.id).toLowerCase() ? -1 : String(left.id).toLowerCase() > String(right.id).toLowerCase() ? 1 : 0));
	if (order === 'updated_at.desc') {
		const stamp = (row) => row.updated_at ?? null;
		return [...rows].sort((left, right) => (stamp(left) === stamp(right) ? 0 : stamp(left) === null ? -1 : stamp(right) === null ? 1 : String(stamp(left)) > String(stamp(right)) ? -1 : 1));
	}
	return fail(`unsupported order ${table}.order=${order}`);
}

function scopedParams(params, path) {
	const prefix = path.length ? `${path.join('.')}.` : '';
	const own = new Map();
	for (const [key, value] of params) {
		if (!key.startsWith(prefix)) continue;
		const rest = key.slice(prefix.length);
		if (!rest.includes('.')) own.set(rest, value);
	}
	return own;
}

function project(row, table, items, context) {
	const out = {};
	for (const item of items) {
		if (item.column === '*') Object.assign(out, row);
		else if (item.column !== undefined) {
			declared(table, item.column);
			if (Object.hasOwn(row, item.column)) out[item.column] = row[item.column];
		} else out[item.alias] = embed(row, table, item, context);
	}
	return out;
}

function embed(parent, parentTable, item, context) {
	const relation = RELATIONS[parentTable]?.[item.table];
	if (!relation || relation.column !== item.hint) fail(`no relationship ${parentTable} -> ${item.table} hinted by "${item.hint}"`);
	const path = [...context.path, item.alias];
	const own = scopedParams(context.params, path);
	for (const key of own.keys()) if (!['order', 'limit'].includes(key)) declared(item.table, key);
	if (relation.toOne) {
		if (own.size) fail(`filters on a to-one embed (${path.join('.')}) are not implemented`);
		const found = context.table(item.table).find((row) => same(row.id, parent[relation.column]));
		return found ? project(found, item.table, item.inner, { ...context, path }) : null;
	}
	let rows = context.table(item.table).filter((row) => same(row[relation.column], parent.id));
	rows = rows.filter((row) => [...own].every(([key, expression]) => ['order', 'limit'].includes(key) || matches(row, item.table, key, expression)));
	rows = ordered(rows, item.table, own.get('order'));
	if (own.has('limit')) rows = rows.slice(0, Number(own.get('limit')));
	return rows.map((row) => project(row, item.table, item.inner, { ...context, path }));
}

function embedPaths(items, rootTable) {
	const paths = new Map([['', rootTable]]);
	const walk = (list, path) => {
		for (const item of list) {
			if (!item.alias) continue;
			const next = path ? `${path}.${item.alias}` : item.alias;
			paths.set(next, item.table);
			walk(item.inner, next);
		}
	};
	walk(items, '');
	return paths;
}

function assertEveryParamUsed(params, items, rootTable) {
	const paths = embedPaths(items, rootTable);
	for (const key of params.keys()) {
		const cut = key.lastIndexOf('.');
		const table = paths.get(cut < 0 ? '' : key.slice(0, cut));
		const leaf = key.slice(cut + 1);
		const isControl = leaf === 'order' || leaf === 'limit' || (cut < 0 && leaf === 'select');
		if (!table || (!isControl && !TABLE_COLUMNS[table].includes(leaf))) fail(`parameter "${key}" matches no column or embed path of the select`);
	}
}

/** True when a GET carries an embed, so the permissive reader should hand it over. */
export function isEmbedRead(params) {
	return String(params.get('select') ?? '').includes('(');
}

/** The rows `GET /<tableName>?<params>` answers, embeds resolved from `table(name)`. */
export function readEmbed(tableName, params, table) {
	if (!TABLE_COLUMNS[tableName]) fail(`unknown table ${tableName}`);
	const items = parseSelect(params.get('select'));
	assertEveryParamUsed(params, items, tableName);
	const own = scopedParams(params, []);
	for (const key of own.keys()) if (!['select', 'order', 'limit'].includes(key)) declared(tableName, key);
	const rows = table(tableName).filter((row) => [...own].every(([key, expression]) => ['select', 'order', 'limit'].includes(key) || matches(row, tableName, key, expression)));
	const limited = ordered(rows, tableName, own.get('order'));
	const capped = own.has('limit') ? limited.slice(0, Number(own.get('limit'))) : limited;
	return capped.map((row) => project(row, tableName, items, { params, table, path: [] }));
}
