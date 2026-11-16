/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-schemaless-tables.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/16 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/16 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// An engine that cannot introspect (redis: a keyspace, no catalogue) answers /schema with
// unsupported_capability, so the app listed the mount with no tables and its rows could
// never be opened: "MDW · Redis" held 34 rows nobody could see (2026-11-16). The workspace
// link (osionos_workspace_databases.tables) already names the tables; their columns come
// from a sample of rows, marked `inferred` like a Mongo collection without a validator.
// Caveat: a column only present in rows past the sample is missing from the view, every
// value reads as its sampled JS type (redis hashes are all strings, so all `text`), and a
// table the link names but the engine no longer holds lists with no columns.

const SAMPLE_ROWS = 20;

function normalizedType(value) {
	if (typeof value === 'boolean') return 'boolean';
	if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'float';
	if (value !== null && typeof value === 'object') return 'json';
	return 'text';
}

function column(name, value) {
	const type = normalizedType(value);
	return {
		name, native_type: type, normalized_type: type, nullable: true, default: null,
		enum_values: null, references: null, inferred: true,
	};
}

/** Columns of one table from its sampled rows: first non-null value decides the type. */
export function inferColumns(rows) {
	const seen = new Map();
	for (const row of rows) {
		if (!row || typeof row !== 'object') continue;
		for (const [name, value] of Object.entries(row)) {
			if (!seen.has(name) || seen.get(name) === null) seen.set(name, value ?? null);
		}
	}
	return [...seen].map(([name, value]) => column(name, value));
}

/**
 * The schema of a non-introspectable mount, built from the tables its workspace link
 * names. `listRows(table, limit)` returns that table's rows; a table whose read fails
 * still lists (with no columns) so one bad table does not hide the others.
 */
export async function linkedTablesSchema(tableNames, listRows) {
	const names = [...new Set((Array.isArray(tableNames) ? tableNames : []).filter((name) => typeof name === 'string' && name))];
	return Promise.all(names.map(async (name) => {
		const rows = await Promise.resolve().then(() => listRows(name, SAMPLE_ROWS)).catch(() => []);
		const columns = inferColumns(Array.isArray(rows) ? rows : []);
		return { name, primary_key: columns.some((c) => c.name === 'id') ? ['id'] : [], columns };
	}));
}
