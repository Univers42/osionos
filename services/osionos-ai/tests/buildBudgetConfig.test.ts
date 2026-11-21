import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * Q7 of groot ADR 0071: a build or undo pass, plus one bridge call that started
 * at its last moment, plus a minute, must end before the sweeper calls an
 * 'executing' row unknown. 300 s - 8 s - 60 s leaves 232 000 ms.
 *
 * The configuration is read at import, so each case is a process of its own.
 */
const CHILD = fileURLToPath(new URL('./prodConfigChild.ts', import.meta.url));

function boot(budgetMs: string) {
	return spawnSync(process.execPath, ['--experimental-strip-types', CHILD], {
		env: { ...process.env, NODE_ENV: 'test', OSIONOS_AI_BUILD_BUDGET_MS: budgetMs },
		encoding: 'utf8',
		timeout: 60_000,
	});
}

describe('the build budget against the sweeper window (Q7)', () => {
	it('refuses a budget that could outrun the sweeper, and keeps the largest one that cannot', () => {
		const refused = boot('232001');
		assert.equal(refused.status, 1);
		assert.match(refused.stderr, /refusing to start: invalid environment variables: OSIONOS_AI_BUILD_BUDGET_MS/);
		assert.ok(!refused.stderr.includes('232001'), 'the value is never printed');

		const kept = boot('232000');
		assert.equal(kept.status, 0, kept.stderr);
		assert.match(kept.stdout, /^RESULT /m);
	});
});
