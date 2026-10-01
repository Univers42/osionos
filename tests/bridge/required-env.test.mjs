import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { demoLoginPassword, readDotEnv, requiredEnv } from '../../scripts/required-env.mjs';

test('requiredEnv returns a set value unchanged', () => {
  assert.equal(requiredEnv('K', 'hint', { K: 'v a l' }), 'v a l');
});

test('requiredEnv rejects an unset variable, naming it and the hint', () => {
  assert.throws(() => requiredEnv('K', 'do X', {}), /^Error: K is not set — do X$/);
});

test('requiredEnv rejects an empty variable instead of returning an empty password', () => {
  assert.throws(() => requiredEnv('K', 'do X', { K: '' }), /K is not set/);
});

test('demoLoginPassword reads DEMO_LOGIN_PASSWORD and points at make demo-login', () => {
  assert.equal(demoLoginPassword({ DEMO_LOGIN_PASSWORD: 'p' }), 'p');
  assert.throws(() => demoLoginPassword({}), /DEMO_LOGIN_PASSWORD is not set — .*make demo-login/);
});

test('readDotEnv parses KEY=VALUE, strips one quote layer, skips comments and blanks', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'required-env-')), '.env');
  writeFileSync(file, '# c=1\nA=1\nB="two=2"\n\n  C = \'3\'\nnot a pair\n');
  assert.deepEqual(readDotEnv(file), { A: '1', B: 'two=2', C: '3' });
});
