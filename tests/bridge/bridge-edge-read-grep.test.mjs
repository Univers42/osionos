/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-edge-read-grep.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The shape of the store (C99, C103), read as a grep:
 *
 *   - ONE module defines the edge read, so the link store cannot grow a second
 *     reader that decides the permissions its own way;
 *   - NO module extracts the [[page:]] mentions but the page-links migration
 *     (the export dialect strips them, it never reads them).
 */

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP = new Set(['node_modules', '.git', 'build', 'dist', 'vendor', 'test-results', 'playwright-report', 'tests']);

/**
 * The places that may read a [[page:]] mention, and why.
 *
 * The link STORE extracts them — in the page-links migration of the models
 * repo, and nowhere else. The editor renders a mention as a link, and the
 * export dialect strips it out of the exported text: neither of them builds a
 * store, so neither of them may decide who may read what. The bridge's markdown
 * bundle (osionos#240) is the engine's matcher again, built by esbuild and held
 * to its source byte for byte (bridge-markdown-engine-drift.test.mjs): it turns
 * a mention into a block for POST /api/pages/from-markdown and builds no store.
 */
const MENTION_READERS = [
	'packages/markdown-engine/markdown/parserInlineMatchers.ts',
	'scripts/bridge-markdown-engine.mjs',
	'src/features/page-export/model/inlineDialect.ts',
];

/**
 * A reader of a [[page:]] mention, in the two shapes the code has had: a
 * capture group right after `page:` (the page-links migration's extractor),
 * and a quoted literal that stops at `[[page:` (a scan for the opener, the
 * engine's shape since it dropped the regex). The editor's insertions write
 * `[[page:${id}]]`, which is neither.
 *
 * Caveat: a grep on the source text. It misses a reader that assembles the
 * opener from pieces or takes it from a constant another file defines, so it
 * under-reports; a new reader shape needs its pattern added here.
 */
const MENTION_READ = /page:\(|(["'`])\[\[page:\1/;

/** The source files of the app, as the paths the repository knows them by. */
function sourceFiles(dir = APP_ROOT) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		if (SKIP.has(entry)) continue;
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) {
			out.push(...sourceFiles(path));
			continue;
		}
		if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(relative(APP_ROOT, path));
	}
	return out;
}

/** The files whose text matches the pattern. */
function filesMatching(pattern) {
	const files = sourceFiles();
	return files.filter((file) => pattern.test(readFileSync(join(APP_ROOT, file), 'utf8'))).sort();
}

describe('one edge read (C99, C103)', () => {
	it('only the edge-read module names the edge read', () => {
		assert.deepEqual(filesMatching(/osionos_bridge_graph_links/), ['scripts/bridge-graph-edges.mjs']);
	});

	it('only the edge-read module queries the link table', () => {
		assert.deepEqual(filesMatching(/osionos_page_links\?|from\s+public\.osionos_page_links/), []);
	});

	it('no module but the renderer and the export dialect reads a [[page:]] mention', () => {
		assert.deepEqual(filesMatching(MENTION_READ), MENTION_READERS);
	});

	it('the export dialect strips the mentions, it never reads an id out of them', () => {
		const source = readFileSync(join(APP_ROOT, 'src/features/page-export/model/inlineDialect.ts'), 'utf8');
		for (const line of source.split('\n')) {
			if (!line.includes('[[page:')) continue;
			assert.ok(line.includes('""'), `the export only removes the mention: ${line.trim()}`);
		}
	});
});
