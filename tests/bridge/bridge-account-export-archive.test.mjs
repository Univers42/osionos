/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-export-archive.test.mjs             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The rules of the export archive that need no server: what a spreadsheet cell may start
 * with, which registry names may reach a request, and which column names are refused.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_MAX_BYTES, EXPORT_MAX_ROWS, buildArtifact, csvCell, planTables, tableCsv } from '../../scripts/bridge-account-export-archive.mjs';

describe('csvCell', () => {
	const prefixed = [['=1+1', "'=1+1"], ['+SUM(A1)', "'+SUM(A1)"], ['-2+3', "'-2+3"], ['@cmd', "'@cmd"], ['\tx', "'\tx"], ['\rx', "'\rx"]];
	for (const [input, expected] of prefixed) {
		it(`prefixes a string that starts with ${JSON.stringify(input.slice(0, 1))}`, () => {
			assert.equal(csvCell(input).replace(/^"|"$/g, ''), expected);
		});
	}
	it('leaves numbers, booleans, null and ordinary text alone', () => {
		assert.equal(csvCell(-5), '-5');
		assert.equal(csvCell(3.5), '3.5');
		assert.equal(csvCell(true), 'true');
		assert.equal(csvCell(null), '');
		assert.equal(csvCell('hello'), 'hello');
	});
	it('quotes commas, quotes and newlines (RFC 4180)', () => {
		assert.equal(csvCell('a,b'), '"a,b"');
		assert.equal(csvCell('say "hi"'), '"say ""hi"""');
		assert.equal(csvCell('a\nb'), '"a\nb"');
	});
	it('writes a table with a header and CRLF line ends', () => {
		assert.equal(tableCsv(['a', 'b'], [{ a: 1, b: '=x' }]), "a,b\r\n1,'=x\r\n");
	});
});

describe('planTables', () => {
	const row = (overrides) => ({ table_name: 'osionos_notes', column_name: 'owner_id', export_columns: ['id', 'title'], ...overrides });
	it('refuses any name that is not a plain identifier, before a request exists', () => {
		for (const bad of [{ table_name: '../evil' }, { table_name: 'a;b' }, { table_name: 'A' }, { column_name: 'x y' }, { export_columns: ['id', 'ti tle'] }, { export_columns: ['id', 'a.b'] }]) {
			assert.throws(() => planTables([row(bad)]), (error) => error.code === 'export_bad_identifier', JSON.stringify(bad));
		}
	});
	it('refuses a column named like a secret', () => {
		for (const name of ['password_hash', 'api_token', 'mfa_secret', 'private_key', 'salt', 'ip_prefix', 'recovery_code', 'totp_seed']) {
			assert.throws(() => planTables([row({ export_columns: ['id', name] })]), (error) => error.code === 'export_forbidden_column', name);
		}
	});
	it('skips a row without export columns and groups the rest per table', () => {
		const plans = planTables([row(), row({ export_columns: null, table_name: 'osionos_secret_things' }), row({ column_name: 'editor_id', export_columns: ['id', 'body'] })]);
		assert.equal(plans.length, 1);
		assert.deepEqual(plans[0].scope, ['owner_id', 'editor_id']);
		assert.deepEqual(plans[0].columns, ['id', 'title', 'body']);
	});
	it('adds both ends of a relation table', () => {
		const [plan] = planTables([{ table_name: 'osionos_connections', column_name: 'requester_id', export_columns: ['requester_id', 'status'] }]);
		assert.deepEqual(plan.scope, ['requester_id', 'addressee_id']);
		assert.ok(plan.columns.includes('addressee_id'));
	});
});

describe('buildArtifact', () => {
	const tables = [{ name: 'osionos_notes', columns: ['id', 'title'], rows: [{ id: '1', title: '=boom' }] }];
	it('keeps the caps at their documented values', () => {
		assert.equal(EXPORT_MAX_BYTES, 50 * 1024 * 1024);
		assert.equal(EXPORT_MAX_ROWS, 250_000);
	});
	it('puts the formula guard in the csv and the zip, and leaves json verbatim', () => {
		assert.match(buildArtifact('csv', tables).bytes.toString(), /'=boom/);
		assert.ok(buildArtifact('zip', tables).bytes.includes(Buffer.from("'=boom")));
		assert.equal(JSON.parse(buildArtifact('json', tables).bytes).tables.osionos_notes[0].title, '=boom');
	});
	it('names every zip entry after the table, never after row data', () => {
		const bytes = buildArtifact('zip', tables).bytes;
		for (const name of ['manifest.json', 'osionos_notes.json', 'osionos_notes.csv']) assert.ok(bytes.includes(Buffer.from(name)), name);
		assert.equal(bytes.includes(Buffer.from('=boom.json')), false);
	});
	it('refuses an unknown format and a table name that is not an identifier', () => {
		assert.throws(() => buildArtifact('xml', tables), (error) => error.code === 'export_bad_format');
		assert.throws(() => buildArtifact('zip', [{ ...tables[0], name: '../x' }]), (error) => error.code === 'export_bad_identifier');
	});
});
