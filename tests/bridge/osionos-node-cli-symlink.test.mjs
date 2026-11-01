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

it('refuses to serve a page that was never built, and names the fix', () => {
	const run = spawnSync(process.execPath, [join(packageDir, 'cli.mjs'), 'serve', '--node', 'probe', '--server', '/nonexistent', '--app-origin', 'https://a.example', '--client', '/nonexistent/client'], {
		encoding: 'utf8',
		env: { ...process.env, HOME: mkdtempSync(join(tmpdir(), 'osionos-home-')), OSIONOS_IDE_TOKEN_SECRET: 'x'.repeat(40), OSIONOS_IDE_OWNER: '00000000-0000-4000-8000-000000000001' },
	});
	assert.equal(run.status, 1);
	assert.match(run.stderr, /index\.html is missing: run packages\/osionos-node\/install\.sh/);
});
