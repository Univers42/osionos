/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-export-archive.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Turns the rows of an account export into the bytes of one artifact (json, csv or
 * zip) and holds every rule about what may go into it: the caps, the identifier
 * rule for names that reach a PostgREST path, the secret-name deny list and the
 * spreadsheet-formula prefix.
 *
 * Caveat: the deny list matches COLUMN names only. A secret stored under an
 * innocent column, or a key inside a jsonb value the user wrote (a page property
 * called "token"), is not looked at; the registry's export_columns are the real
 * allowlist and a catalog check on the root side guards them. The formula prefix
 * covers = + - @ tab and CR at the start of a string cell; a spreadsheet that
 * treats another leading character as a formula is not covered. The caps are
 * unmeasured defaults, and the byte cap is checked on the finished archive, so
 * peak memory can briefly exceed it.
 */

import { buildZip } from './bridge-zip.mjs';

export const EXPORT_MAX_BYTES = 50 * 1024 * 1024;
export const EXPORT_MAX_ROWS = 250_000;
export const EXPORT_SCHEMA_VERSION = 1;
export const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
export const SECRET_NAME = /hash|secret|token|password|recovery|totp|key|salt|ip_prefix/i;
// The other side of a relation is part of the export too: a connection the user
// accepted is still a connection of the user. Only the peer's id travels (the
// registry lists no other column of these tables).
const EDGE_COLUMNS = {
	osionos_connections: ['requester_id', 'addressee_id'],
	osionos_follows: ['follower_id', 'followee_id'],
};
const CONTENT_TYPES = { json: 'application/json', csv: 'text/csv; charset=utf-8', zip: 'application/zip' };

function exportError(code, message) {
	return Object.assign(new Error(message), { status: 500, code });
}

function assertIdentifier(name) {
	if (typeof name !== 'string' || !IDENTIFIER.test(name)) throw exportError('export_bad_identifier', 'A registry name is not a plain identifier.');
	return name;
}

/**
 * One plan per exported table from the registry rows that carry export_columns:
 * `{ table, columns, scope }`. `scope` are the columns that may hold the user's id.
 * Every name is validated before it can reach a request path.
 */
export function planTables(registryRows) {
	const plans = new Map();
	for (const row of Array.isArray(registryRows) ? registryRows : []) {
		if (!Array.isArray(row?.export_columns) || row.export_columns.length === 0) continue;
		const table = assertIdentifier(row.table_name);
		const plan = plans.get(table) ?? { table, columns: [], scope: [] };
		for (const column of row.export_columns) {
			assertIdentifier(column);
			if (SECRET_NAME.test(column)) throw exportError('export_forbidden_column', 'A registry export column is named like a secret.');
			if (!plan.columns.includes(column)) plan.columns.push(column);
		}
		const scope = assertIdentifier(row.column_name);
		if (!plan.scope.includes(scope)) plan.scope.push(scope);
		plans.set(table, plan);
	}
	for (const plan of plans.values()) {
		for (const column of EDGE_COLUMNS[plan.table] ?? []) if (!plan.scope.includes(column)) plan.scope.push(column);
		for (const column of plan.scope) if (!plan.columns.includes(column) && EDGE_COLUMNS[plan.table]) plan.columns.push(column);
	}
	return [...plans.values()].sort((left, right) => left.table.localeCompare(right.table));
}

/** One RFC 4180 cell. A string that starts like a formula is prefixed with an apostrophe. */
export function csvCell(value) {
	if (value === null || value === undefined) return '';
	let text;
	if (typeof value === 'string') text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	else if (typeof value === 'object') text = JSON.stringify(value);
	else text = String(value);
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csvLine = (cells) => `${cells.map(csvCell).join(',')}\r\n`;

/** One table as a CSV with a header row. */
export function tableCsv(columns, rows) {
	return csvLine(columns) + rows.map((row) => csvLine(columns.map((column) => row[column]))).join('');
}

/** Every table in one CSV, in long form: table,row,column,value. */
function longCsv(tables) {
	const lines = [csvLine(['table', 'row', 'column', 'value'])];
	for (const { name, columns, rows } of tables) {
		rows.forEach((row, index) => {
			for (const column of columns) lines.push(csvLine([name, index + 1, column, row[column]]));
		});
	}
	return lines.join('');
}

function manifestOf(tables, generatedAt) {
	return {
		schemaVersion: EXPORT_SCHEMA_VERSION,
		generatedAt,
		tables: Object.fromEntries(tables.map((table) => [table.name, table.rows.length])),
	};
}

function zipEntries(tables, manifest) {
	const files = [{ name: 'manifest.json', bytes: Buffer.from(JSON.stringify(manifest, null, 2)) }];
	for (const { name, columns, rows } of tables) {
		files.push({ name: `${name}.json`, bytes: Buffer.from(JSON.stringify(rows)) });
		files.push({ name: `${name}.csv`, bytes: Buffer.from(tableCsv(columns, rows)) });
	}
	return files;
}

/**
 * The artifact for `format` from `tables` = `[{ name, columns, rows }]`.
 * Returns `{ bytes, contentType, manifest }`; throws `export_too_large` over the byte cap.
 */
export function buildArtifact(format, tables, generatedAt = new Date().toISOString()) {
	if (!(format in CONTENT_TYPES)) throw exportError('export_bad_format', 'The export format is not supported.');
	for (const table of tables) assertIdentifier(table.name);
	const manifest = manifestOf(tables, generatedAt);
	let bytes;
	if (format === 'json') {
		const body = Object.fromEntries(tables.map((table) => [table.name, table.rows]));
		bytes = Buffer.from(JSON.stringify({ manifest, tables: body }));
	} else if (format === 'csv') {
		bytes = Buffer.from(longCsv(tables));
	} else {
		bytes = buildZip(zipEntries(tables, manifest));
	}
	if (bytes.length > EXPORT_MAX_BYTES) throw Object.assign(exportError('export_too_large', 'The export is over the size cap.'), { status: 413 });
	return { bytes, contentType: CONTENT_TYPES[format], manifest };
}
