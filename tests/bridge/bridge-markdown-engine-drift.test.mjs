// osionos#240 M240-11/12: scripts/bridge-markdown-engine.mjs is exactly what the pinned
// esbuild builds from today's sources. The header's source hash must match the files, the
// whole bundle must rebuild byte for byte, and the engine commit must be the submodule's.
// Without the submodule every check here would compare nothing, so each one goes through
// requireMarkdownEngine (a loud SKIP locally, a failure under CI).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUNDLE_PATH, buildBundle, engineCommit, ESBUILD_VERSION, readHeader, sourceHashOf } from '../../scripts/build-bridge-markdown-engine.mjs';
import { requireMarkdownEngine, ROOT } from '../fixtures/markdown-import/engine-presence.mjs';

const committed = readFileSync(`${ROOT}${BUNDLE_PATH}`, 'utf8');
const header = readHeader(committed);

describe('the committed markdown bundle (M240-11)', () => {
	it('records the esbuild version, the engine commit and the source hash', () => {
		assert.equal(header.esbuild, ESBUILD_VERSION);
		assert.match(header['engine-commit'] ?? '', /^[0-9a-f]{40}$/);
		assert.match(header['source-sha256'] ?? '', /^[0-9a-f]{64}$/);
	});

	it('rebuilds byte for byte from the sources with the pinned esbuild', async (t) => {
		if (!requireMarkdownEngine(t)) return;
		const rebuilt = await buildBundle({ commit: header['engine-commit'] });
		assert.equal(rebuilt.sourceHash, header['source-sha256'], 'a bundled source changed: run node scripts/build-bridge-markdown-engine.mjs');
		assert.ok(rebuilt.text === committed, 'the bundle differs from a fresh build: run node scripts/build-bridge-markdown-engine.mjs');
	});

	it('names the engine commit the submodule has checked out', (t) => {
		if (!requireMarkdownEngine(t)) return;
		const checkedOut = engineCommit({});
		if (checkedOut === null) {
			// The suite's container cannot always read a worktree's gitdir; CI compares on the runner.
			const message = 'SKIP osionos#240: git cannot read packages/markdown-engine here; scripts/check-bridge-markdown-engine-pin.sh compares the commit in CI.';
			console.warn(`\n${'!'.repeat(8)} ${message}\n`);
			t.skip(message.replace(/^SKIP /, ''));
			return;
		}
		assert.equal(header['engine-commit'], checkedOut);
	});

	it('fails the source hash when one bundled file changes', async (t) => {
		if (!requireMarkdownEngine(t)) return;
		const { inputs } = await buildBundle({ commit: header['engine-commit'] });
		assert.ok(inputs.includes('packages/markdown-engine/markdown/parser.ts'));
		assert.ok(inputs.includes('src/entities/block/model/linkBlocks.ts'));
		assert.notEqual(sourceHashOf(inputs.filter((path) => !path.endsWith('parser.ts'))), header['source-sha256']);
	});
});
