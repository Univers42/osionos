/* ************************************************************************** */
/*  web-dockerfile-closure.test.ts — the image build sees vite.config's imports */
/* ************************************************************************** */

// Dockerfile.prod's builder stage COPYs paths by name, so a module vite.config.ts imports
// but the stage omits builds locally and fails only in CI's image job ("Could not resolve
// ./scripts/vite/vendorChunks", 2026-10-14) — a job feature branches never run.
// Caveat: static `from "./x"` imports of vite.config.ts only — a module those files import
// in turn, or a dynamic import(), is not followed (under-reports).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const relativeImports = (source: string) =>
	[...source.matchAll(/\bfrom\s*["']\.\/([^"']+)["']/g)].map((match) => match[1]);

const builderCopySources = (dockerfile: string) =>
	dockerfile
		.split("\n")
		.filter((line) => /^COPY\s/.test(line) && !/--from=/.test(line))
		.flatMap((line) => line.trim().split(/\s+/).slice(1, -1));

test("Dockerfile.prod COPYs every relative module vite.config.ts imports", () => {
	const imports = relativeImports(read("vite.config.ts"));
	assert.ok(imports.length > 0, "vite.config.ts relative imports not found — the regex is stale");
	const sources = builderCopySources(read("docker/services/node/Dockerfile.prod"));
	const missing = imports.filter((path) => !sources.some((src) => path === src || path.startsWith(`${src}/`)));
	assert.deepEqual(missing, []);
});
