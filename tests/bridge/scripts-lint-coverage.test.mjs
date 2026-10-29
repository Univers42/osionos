/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   scripts-lint-coverage.test.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #59: two release bugs were bridge calls to functions that no longer existed; a
// fail-closed catch turned the ReferenceError into an empty list. `lint` and `quality`
// must reach the root scripts/, and no-undef must fire there.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { dockerRunCalls } from './support/docker-run-calls.mjs';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

for (const target of ['lint', 'lint-fix', 'quality']) {
	test(`${target} runs eslint over the root scripts/`, () => {
		const eslint = dockerRunCalls(target, [], ['pnpm', 'node', 'bash']).find((call) => call[2] === 'eslint');
		assert.ok(eslint, `${target} never ran eslint`);
		assert.ok(eslint.includes('scripts/'), `eslint argv: ${eslint.join(' ')}`);
	});
}

async function undefinedNames(file, code) {
	const [result] = await new ESLint({ cwd: APP_ROOT }).lintText(code, { filePath: join(APP_ROOT, file) });
	return result.messages.filter((message) => message.ruleId === 'no-undef').map((message) => message.message);
}

test('a bridge module calling a removed helper fails lint, node globals do not', async () => {
	const code = [
		'export async function favorites() {',
		'\ttry { return await idsFilter([]); } catch { return []; }',
		'}',
		"export const empty = Buffer.from('');",
		'setImmediate(() => clearImmediate(undefined));',
	].join('\n');
	assert.deepEqual(await undefinedNames('scripts/bridge-probe.mjs', code), ["'idsFilter' is not defined."]);
});

test('browser globals are an error in bridge and IDE modules, allowed in Playwright drivers', async () => {
	const code = 'export const title = () => document.title;\n';
	assert.deepEqual(await undefinedNames('scripts/bridge-probe.mjs', code), ["'document' is not defined."]);
	assert.deepEqual(await undefinedNames('scripts/ide-probe.mjs', code), ["'document' is not defined."]);
	assert.deepEqual(await undefinedNames('scripts/probe-driver.mjs', code), []);
});
