import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/** C144: sentiment is display-only; no moderation or recommender code imports it. */

const SRC = new URL('../src', import.meta.url).pathname;

function filesUnder(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? filesUnder(join(dir, entry.name)) : entry.name.endsWith('.ts') ? [join(dir, entry.name)] : [],
	);
}

describe('sentiment isolation', () => {
	it('C144 nothing under src/moderation or src/recs imports from sentiment', () => {
		const files = [...filesUnder(join(SRC, 'moderation')), ...filesUnder(join(SRC, 'recs'))];
		assert.ok(files.length > 0, 'the guard looks at something');
		for (const file of files) {
			const imports = readFileSync(file, 'utf8').match(/^\s*(?:import|export)\b[^;]*?from\s+['"][^'"]+['"]/gm) ?? [];
			for (const line of imports) {
				assert.ok(!/sentiment/i.test(line.split(/from\s+/).pop() ?? ''), `${file} imports ${line.trim()}`);
			}
		}
	});
});
