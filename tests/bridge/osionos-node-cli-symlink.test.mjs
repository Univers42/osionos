// The cli runs when reached through a symlink, as ~/.osionos/src is: it used to exit 0
// having done nothing.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';
import assert from 'node:assert/strict';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/osionos-node');

it('prints its usage through a symlinked checkout', () => {
	const dir = mkdtempSync(join(tmpdir(), 'osionos-cli-'));
	try {
		const link = join(dir, 'link');
		symlinkSync(packageDir, link);
		const run = spawnSync(process.execPath, [join(link, 'cli.mjs')], { encoding: 'utf8' });
		assert.equal(run.status, 1);
		assert.match(run.stderr, /usage: osionos-node/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
