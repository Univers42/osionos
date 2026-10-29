/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   docker-run-test-args.test.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #63: `npm run test:bridge -- <file>` must run that file, not the whole suite plus it.
// A fake `node` first on PATH records the argv docker-run.sh would hand the real one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function runnerArgv(target, args) {
	const bin = mkdtempSync(join(tmpdir(), 'docker-run-argv-'));
	try {
		writeFileSync(join(bin, 'node'), '#!/bin/sh\nprintf "%s\\n" "$@"\n');
		chmodSync(join(bin, 'node'), 0o755);
		const out = execFileSync('bash', ['scripts/docker-run.sh', target, ...args], {
			cwd: APP_ROOT,
			env: { ...process.env, OSIONOS_IN_DOCKER: '1', PATH: `${bin}:${process.env.PATH}` },
			encoding: 'utf8',
		});
		return out.split('\n').filter(Boolean);
	} finally {
		rmSync(bin, { recursive: true, force: true });
	}
}

const testFiles = (argv) => argv.filter((arg) => /\.test\.(mjs|ts)$/.test(arg));

test('test-bridge with a file argument runs only that file', () => {
	const file = 'tests/bridge/docker-run-test-args.test.mjs';
	assert.deepEqual(testFiles(runnerArgv('test-bridge', [file])), [file]);
});

test('test-bridge with only flags still runs the whole suite', () => {
	const argv = runnerArgv('test-bridge', ['--test-name-pattern=closure']);
	assert.ok(testFiles(argv).length > 100, `expected the full glob, got ${testFiles(argv).length} files`);
	assert.ok(argv.includes('--test-name-pattern=closure'));
});

test('test-canvas with a file argument runs only that file', () => {
	const file = 'tests/canvas/cell-visibility-formula.test.ts';
	assert.deepEqual(testFiles(runnerArgv('test-canvas', [file])), [file]);
});
