import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Enable Node's module mocks only in this process, preserving the normal canvas suite.
test('collab-live-writes regressions', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    '--experimental-strip-types', '--experimental-loader',
    fileURLToPath(new URL('./ts-extension-loader.mjs', import.meta.url)),
    '--experimental-test-module-mocks', '--test', '--test-reporter=tap',
    fileURLToPath(new URL('./fixtures/collab-live-writes.ts', import.meta.url)),
  ], { encoding: 'utf8', timeout: 15_000, env });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# tests 4\b/, result.stdout + result.stderr);
});
