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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockerRunCalls } from './support/docker-run-calls.mjs';

const runnerArgv = (target, args) => dockerRunCalls(target, args)[0];

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
