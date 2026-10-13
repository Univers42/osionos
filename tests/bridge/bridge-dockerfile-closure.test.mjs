/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-dockerfile-closure.test.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The fly image COPYs bridge modules by name: a module bridge-api.mjs imports but the
// Dockerfile omits works under `npm run bridge:api` and crashes the built image at boot.
// Ponytail: static `import … from './x.mjs'` / `export … from './x.mjs'` only — a dynamic
// import() with a computed path, or a `../` import, is invisible to it (under-reports);
// an import inside a comment or string is counted (over-reports, merely noisy).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPTS = resolve(APP_ROOT, 'scripts');
const STATIC_IMPORT = /\b(?:import|export)\s[^;]*?\bfrom\s*['"]\.\/([\w.-]+\.mjs)['"]/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*['"]\.\/([\w.-]+\.mjs)['"]/g;

function relativeImports(file) {
	const source = readFileSync(resolve(SCRIPTS, file), 'utf8');
	return [...source.matchAll(STATIC_IMPORT), ...source.matchAll(SIDE_EFFECT_IMPORT)].map((match) => match[1]);
}

function importClosure(entry) {
	const seen = new Set();
	const pending = [entry];
	while (pending.length > 0) {
		const file = pending.pop();
		if (seen.has(file)) continue;
		seen.add(file);
		pending.push(...relativeImports(file));
	}
	return seen;
}

function copiedScripts(dockerfile) {
	const instructions = readFileSync(dockerfile, 'utf8').replace(/\\\r?\n/g, ' ').split(/\r?\n/);
	const sources = instructions.filter((line) => /^\s*COPY\s/i.test(line)).flatMap((line) => line.trim().split(/\s+/).slice(1, -1));
	return new Set(sources.map((source) => /^(?:\.\/)?scripts\/([\w.-]+\.mjs)$/.exec(source)?.[1]).filter(Boolean));
}

describe('deploy/bridge-fly/Dockerfile', () => {
	it('COPYs every module in the static import closure of scripts/bridge-api.mjs', () => {
		const closure = importClosure('bridge-api.mjs');
		assert.ok(closure.has('bridge-page-read.mjs') && closure.size > 10, `closure looks wrong: ${[...closure].join(', ')}`);
		const copied = copiedScripts(resolve(APP_ROOT, 'deploy/bridge-fly/Dockerfile'));
		assert.deepEqual([...closure].filter((file) => !copied.has(file)).sort(), []);
	});
});
