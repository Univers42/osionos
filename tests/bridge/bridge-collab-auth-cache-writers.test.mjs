/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-collab-auth-cache-writers.test.mjs          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Every in-process writer of something an access verdict reads must invalidate the collab
// access cache (bridge-access-generation.mjs). This test scans the bridge sources and fails
// when a writer lacks a bump, so a writer added next month cannot silently leave a stale allow.
//
// Caveat: the scan is lexical (tests/bridge/support/access-writers-scan.mjs). A writer whose
// table is built at run time is invisible to it, which under-reports; the floor below only
// proves the scan still finds the writers known today.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { namesAccessTable, scanAccessWriters } from './support/access-writers-scan.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPTS = join(ROOT, 'scripts');
const SKIPPED = new Set(['bridge-access-generation.mjs']);
const WRITERS_FLOOR = 30;

// A writer that changes no column an access verdict reads. `has` pins the entry to one call.
const EXEMPT = [
	{ file: 'scripts/bridge-api.mjs', has: 'body: patch, prefer', reason: 'handleMarketplacePatch: PATCHes title, icon and properties only; no access column' },
	{ file: 'scripts/bridge-api.mjs', has: 'body: refresh, prefer', reason: 'recordNoteRefresh: PATCHes title and properties only; no access column' },
];

function bridgeSources() {
	return readdirSync(SCRIPTS)
		.filter((name) => /^bridge-.*\.mjs$/.test(name) && !SKIPPED.has(name))
		.map((name) => ({ path: `scripts/${name}`, source: readFileSync(join(SCRIPTS, name), 'utf8') }));
}

function scanAll() {
	return bridgeSources().map(({ path, source }) => ({ path, source, ...scanAccessWriters(path, source) }));
}

const exemption = (path, writer) => EXEMPT.find((entry) => entry.file === path && writer.text.includes(entry.has));

describe('collab auth cache: every access writer bumps', () => {
	it('reads every bridge file that names an access table to its end', () => {
		const unread = scanAll().filter((file) => !file.clean && namesAccessTable(file.source)).map((file) => file.path);
		assert.deepEqual(unread, []);
	});

	it('finds the writers known today, so an empty scan is not green', () => {
		const found = scanAll().flatMap((file) => file.writers);
		assert.ok(found.length >= WRITERS_FLOOR, `found ${found.length} writers, expected at least ${WRITERS_FLOOR}`);
		assert.ok(found.filter((writer) => writer.bumped).length >= WRITERS_FLOOR - EXEMPT.length);
	});

	it('has no writer outside bumpAccessAfter unless it is exempt', () => {
		const loose = scanAll().flatMap((file) => file.writers
			.filter((writer) => !writer.bumped && !exemption(file.path, writer))
			.map((writer) => `${file.path}:${writer.line} ${writer.callee}`));
		assert.deepEqual(loose, [], 'wrap the write in bumpAccessAfter(write, scope) from bridge-access-generation.mjs');
	});

	it('has no exemption that matches nothing (a stale entry would hide a new writer)', () => {
		const files = scanAll();
		const stale = EXEMPT.filter((entry) => {
			const file = files.find((candidate) => candidate.path === entry.file);
			return !file?.writers.some((writer) => !writer.bumped && writer.text.includes(entry.has));
		});
		assert.deepEqual(stale, []);
	});

	it('bumps on a session cutoff or revoke applied in this process', () => {
		const source = readFileSync(join(SCRIPTS, 'bridge-session-tracker.mjs'), 'utf8');
		const body = source.slice(source.indexOf('applyLocal('));
		assert.match(body.slice(0, body.indexOf('}\n')), /bumpAccess\(\)/);
	});
});

describe('collab auth cache: the writers scanner itself', () => {
	it('flags a write to an access table that is not wrapped', () => {
		const { writers } = scanAccessWriters('scripts/bridge-x.mjs', "async function f() { await post(config, 'osionos_workspace_members', row); }\n");
		assert.equal(writers.length, 1);
		assert.equal(writers[0].bumped, false);
	});

	it('does not flag a wrapped write, a read, or a table name inside a comment', () => {
		const wrapped = "async function f() { await bumpAccessAfter(post(config, 'osionos_workspace_members', row), { workspaceId }); }\n";
		const read = "async function f() { return get(config, 'osionos_workspace_members?select=*'); }\n";
		const comment = "// post(config, 'osionos_workspace_members', row)\nconst x = 1;\n";
		assert.deepEqual(scanAccessWriters('scripts/bridge-x.mjs', wrapped).writers.map((writer) => writer.bumped), [true]);
		assert.deepEqual(scanAccessWriters('scripts/bridge-x.mjs', read).writers, []);
		assert.deepEqual(scanAccessWriters('scripts/bridge-x.mjs', comment).writers, []);
	});

	it('sees a multi-line write and a method: option', () => {
		const multi = "await patch(\n\tconfig,\n\t'osionos_pages?id=eq.1',\n\t{ archived_at: now },\n);\n";
		const raw = "await rest(config, 'osionos_share_rules', { method: 'DELETE' });\n";
		assert.deepEqual(scanAccessWriters('scripts/bridge-x.mjs', multi).writers.map((writer) => writer.bumped), [false]);
		assert.deepEqual(scanAccessWriters('scripts/bridge-x.mjs', raw).writers.map((writer) => writer.bumped), [false]);
	});
});
