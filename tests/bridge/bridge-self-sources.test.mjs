/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-self-sources.test.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The registry of the self sources: the seven shipped ids, the ordered allowlist of each,
 * and the allowlist against the real columns of the table it reads.
 *
 * The root SQL lives in the root repo, a sibling checkout that the app container does not
 * mount, so the columns of the tables are kept here as a snapshot of the root migrations.
 * When the root tree IS reachable — OSIONOS_MODELS_DIR, or the sibling checkout of a
 * worktree — the snapshot is checked against the SQL, so it cannot rot unnoticed.
 *
 * The subset check never passes on empty input: the table must have been found and its
 * column set must be non-empty before the comparison.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_ACCESS_COLUMNS, SELF_SOURCES, selfSourceById } from '../../scripts/bridge-self-sources.mjs';

// my-activity is registered only while the activity flag is on; the flag-off case is tested explicitly.
process.env.OSIONOS_ACTIVITY = '1';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// The columns of the tables the eight sources read, as the root migrations create them.
const TABLE_COLUMNS = {
	osionos_pages: [
		'id', 'workspace_id', 'parent_page_id', 'owner_id', 'title', 'icon', 'cover', 'database_id',
		'surface', 'visibility', 'collaborators', 'properties', 'content', 'is_template',
		'is_default_template', 'recurrence', 'template_surface', 'archived_at', 'created_at', 'updated_at',
	],
	osionos_tasks: ['page_id', 'block_id', 'workspace_id', 'owner_id', 'content', 'checked', 'due_at', 'updated_at'],
	osionos_published_pages: ['token', 'page_id', 'owner_id', 'title', 'icon', 'content', 'published_at'],
	osionos_connections: [
		'id', 'requester_id', 'addressee_id', 'status', 'intro_message', 'source', 'pair_key',
		'created_at', 'responded_at',
	],
	osionos_follows: ['follower_id', 'followee_id', 'created_at'],
	osionos_workspace_members: ['workspace_id', 'user_id', 'role', 'permissions', 'created_at', 'updated_at'],
	osionos_workspaces: ['id', 'owner_id', 'name', 'slug', 'source', 'settings', 'created_at', 'updated_at'],
	osionos_sessions: [
		'id', 'user_id', 'created_at', 'expires_at', 'last_seen_at', 'auth_method', 'ip_prefix',
		'ip_hash', 'user_agent', 'sudo_until', 'refresh_hash', 'family_id', 'parent_id',
		'revoked_at', 'revoked_reason',
	],
	osionos_activity_events: ['id', 'ts', 'user_id', 'workspace_id', 'event', 'surface'],
	osionos_people_directory: [
		'user_id', 'display_name', 'username', 'profile', 'last_seen_at', 'directory_opt_out',
		'search_doc', 'headline',
	],
};

// The nine columns the account role may select on public.osionos_sessions.
const SESSION_GRANT = [
	'id', 'created_at', 'expires_at', 'last_seen_at', 'auth_method', 'ip_prefix', 'user_agent',
	'revoked_at', 'revoked_reason',
];

// The root tree, when the machine has it: an env var first, then the sibling checkout of
// a worktree (app at <root>/<worktree>/app, the SQL at <root>/root-integration).
const MODELS_CANDIDATES = [
	process.env.OSIONOS_MODELS_DIR,
	resolve(APP_ROOT, '../../root-integration/models'),
	resolve(APP_ROOT, '../root-integration/models'),
	resolve(APP_ROOT, '../../../root-integration/models'),
].filter((dir) => typeof dir === 'string' && dir !== '');

function modelsDir() {
	return MODELS_CANDIDATES.find((dir) => existsSync(dir)) ?? null;
}

/** The columns of a table, as the root migration creates them. */
function columnsFromSql(dir, table) {
	const needle = `CREATE TABLE IF NOT EXISTS public.${table} (`;
	for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql'))) {
		const sql = readFileSync(resolve(dir, file), 'utf8');
		const at = sql.indexOf(needle);
		if (at === -1) continue;
		const columns = [];
		for (const line of sql.slice(at + needle.length).split('\n')) {
			const trimmed = line.trim();
			if (trimmed.startsWith(')') || trimmed === '') {
				if (trimmed.startsWith(')')) break;
				continue;
			}
			const match = /^([a-z_][a-z0-9_]*)\s+[A-Z]/.exec(trimmed);
			if (match) columns.push(match[1]);
		}
		if (columns.length > 0) return columns;
	}
	return null;
}

/** The nine columns of the account role's grant on public.osionos_sessions. */
function grantFromSql(dir) {
	const file = resolve(dir, 'osionos-account-foundation-migration.sql');
	if (!existsSync(file)) return null;
	const sql = readFileSync(file, 'utf8');
	const match = /GRANT SELECT \(([^)]*)\)\s+ON public\.osionos_sessions TO osionos_account_user;/.exec(sql);
	if (!match) return null;
	return match[1].split(',').map((part) => part.trim()).filter(Boolean);
}

describe('the self source registry', () => {
	it('holds exactly the eight shipped sources, and nothing else', () => {
		assert.deepEqual(SELF_SOURCES.map((source) => source.id), [
			'my-pages', 'my-tasks', 'my-published', 'my-connections', 'my-followers', 'my-workspaces', 'my-sessions', 'my-activity',
		]);
		for (const source of SELF_SOURCES) {
			assert.equal(selfSourceById(source.id), source, `${source.id} is found by its id`);
			assert.equal(typeof source.label, 'string');
			assert.ok(source.label.length > 0, `${source.id} has a label`);
			assert.equal(typeof source.table, 'string');
			assert.ok(source.table.startsWith('osionos_'), `${source.id} names a table`);
		}
		assert.equal(selfSourceById('my-nothing'), null, 'a source without a table is not in the registry');
		assert.equal(selfSourceById(''), null);
		assert.equal(selfSourceById(null), null);
		assert.equal(selfSourceById('MY-PAGES'), null, 'the id is the one of the source');
	});

	it('gives every source an ordered allowlist without a duplicate or an empty name', () => {
		for (const source of SELF_SOURCES) {
			assert.ok(Array.isArray(source.columns) && source.columns.length > 0, `${source.id} has columns`);
			assert.equal(new Set(source.columns).size, source.columns.length, `${source.id} has no duplicate column`);
			for (const column of source.columns) {
				assert.match(column, /^[a-z_][a-z0-9_]*$/, `${source.id}.${column} is a plain column name`);
			}
			assert.equal(typeof source.order, 'string');
			assert.match(source.order, /^[a-z_]+\.(asc|desc)$/, `${source.id} orders by a column`);
		}
	});

	it('reads the columns the account role may select, and never a column it may not', () => {
		const sessions = selfSourceById('my-sessions');
		for (const column of sessions.columns) {
			assert.ok(SESSION_GRANT.includes(column), `${column} is one of the nine granted columns`);
		}
		assert.ok(!sessions.columns.includes('ip_hash'), 'the keyed hash of the address never leaves');
		assert.ok(!sessions.columns.includes('refresh_hash'), 'the hash of the refresh token never leaves');
		assert.ok(!sessions.columns.includes('ip_prefix'), 'a dashboard block has no need of a device fingerprint');
	});

	it('keeps every allowlist inside the real columns of the tables it reads', () => {
		for (const source of SELF_SOURCES) {
			const main = TABLE_COLUMNS[source.table];
			const related = source.related ? TABLE_COLUMNS[source.related.table] : [];
			assert.ok(Array.isArray(main), `the table ${source.table} is known`);
			assert.ok(main.length > 0, `the table ${source.table} has columns`);
			for (const column of source.columns) {
				assert.ok(
					main.includes(column) || related.includes(column),
					`${source.id}.${column} is a real column of ${source.table}`,
				);
			}
			for (const column of source.readColumns ?? []) {
				assert.ok(main.includes(column), `${source.id} reads ${column} from ${source.table}`);
				// The one column read and not answered is one the page access filter needs.
				const forAccess = source.pageAccess === true && PAGE_ACCESS_COLUMNS.includes(column);
				assert.ok(source.columns.includes(column) || forAccess, `${source.id} answers the column it reads`);
			}
		}
	});

	it('keeps the related table of a source inside the real columns of that table', () => {
		for (const source of SELF_SOURCES) {
			if (!source.related) continue;
			const columns = TABLE_COLUMNS[source.related.table];
			assert.ok(Array.isArray(columns), `the table ${source.related.table} is known`);
			assert.ok(columns.length > 0, `the table ${source.related.table} has columns`);
			for (const column of source.related.columns) {
				assert.ok(columns.includes(column), `${source.related.table}.${column} is a real column`);
			}
		}
	});

	it('names a scope every source can narrow its rows with', () => {
		for (const source of SELF_SOURCES) {
			const scope = source.scope;
			assert.ok(scope && typeof scope.kind === 'string', `${source.id} has a scope`);
			if (scope.kind === 'owner' || scope.kind === 'membership') {
				assert.match(scope.column, /^[a-z_][a-z0-9_]*$/, `${source.id} scopes on a column`);
			}
			if (scope.kind === 'edge') {
				assert.equal(scope.columns.length, 2, `${source.id} scopes on the two ends of the edge`);
			}
			if (scope.kind === 'account') {
				assert.equal(source.scope.column, undefined, 'the account role is scoped by the table itself');
			}
		}
	});

	it('matches the root SQL when the root tree is reachable', (t) => {
		const dir = modelsDir();
		if (!dir) {
			// The root repo is not mounted in the app container: the snapshot above is the
			// check that runs there, and this one is the one that keeps the snapshot honest.
			t.skip('root models/ not reachable: ' + (MODELS_CANDIDATES.join(', ') || 'none'));
			return;
		}
		for (const source of SELF_SOURCES) {
			const columns = columnsFromSql(dir, source.table);
			assert.ok(Array.isArray(columns) && columns.length > 0, `${source.table} was found in the root SQL`);
			for (const column of source.columns) {
				assert.ok(columns.includes(column), `${source.id}.${column} is a column of ${source.table} in the root SQL`);
			}
		}
		const grant = grantFromSql(dir);
		assert.ok(Array.isArray(grant) && grant.length > 0, 'the grant of the sessions table was found');
		for (const column of selfSourceById('my-sessions').columns) {
			assert.ok(grant.includes(column), `${column} is one of the nine granted columns in the root SQL`);
		}
	});
});
