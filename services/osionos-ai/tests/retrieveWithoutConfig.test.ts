import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';

/** The eval runners (eval/run.sh, eval/answers/answers.sh) call retrieve() with no server environment. */
it('retrieve() without packs runs without the service configuration', () => {
	const script = `
		import { retrieve } from './src/retrieval/search.ts';
		const db = { query: async () => ({ rows: [], rowCount: 0 }) };
		const user = { userId: '00000000-0000-4000-8000-000000000001', workspaceId: '', memberWorkspaces: [], isAdmin: false };
		console.log(JSON.stringify(await retrieve(db, user, { query: 'anything' })));
	`;
	const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script], {
		cwd: fileURLToPath(new URL('..', import.meta.url)),
		env: { PATH: process.env.PATH ?? '' },
		encoding: 'utf8',
	});
	assert.equal(child.stderr.includes('refusing to start'), false, child.stderr);
	assert.equal(child.status, 0, child.stderr);
	assert.equal(child.stdout.trim(), '[]');
});
