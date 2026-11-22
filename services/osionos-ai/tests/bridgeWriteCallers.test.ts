import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Every write to the bridge goes through one of a closed set of files. The
 * walk is a plain recursive read of src (not `git grep`: the suite runs in a
 * container with no git).
 *
 * Caveat: a textual match on `bridgeWrite(`. A caller that aliases the import
 * or reaches it by a dynamic import is not seen; the allowlist under-reports.
 */
const SRC = join(import.meta.dirname, '..', 'src');

// approvals/undoApplied.ts is allowed ahead of the task that creates it.
const ALLOWED = new Set([
	'approvals/apply.ts',
	'approvals/applyAppend.ts',
	'approvals/undoApplied.ts',
	'builders/execute.ts',
	'builders/undo.ts',
	'approvals/bridge.ts',
]);

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : [],
	);
}

describe('who may call bridgeWrite', () => {
	const callers = new Set(
		walk(SRC)
			.filter((file) => readFileSync(file, 'utf8').includes('bridgeWrite('))
			.map((file) => relative(SRC, file)),
	);

	it('only the allowlisted files', () => {
		for (const file of callers) assert.ok(ALLOWED.has(file), `${file} calls bridgeWrite outside the allowlist`);
	});

	it('the apply core owns the write; the decision file does not', () => {
		assert.ok(callers.has('approvals/apply.ts'));
		assert.ok(callers.has('approvals/applyAppend.ts'));
		assert.ok(!callers.has('approvals/execute.ts'));
	});
});
