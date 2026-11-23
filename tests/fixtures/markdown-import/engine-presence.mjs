// The #240 drift and parity tests compare against the markdown-engine submodule. A bare
// worktree has it empty, and a test that then compared nothing would pass vacuously
// (ruling M240-12): each such test calls this first. Locally it skips with a SKIP line
// that names the missing path; under CI (or OSIONOS_REQUIRE_MARKDOWN_ENGINE=1) the
// absence fails the test. CI also checks the path on the runner before the suites run
// (scripts/check-bridge-markdown-engine-pin.sh), because the suites' container does not
// see the runner's CI variable.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ENGINE_ENTRY = 'packages/markdown-engine/markdown/shortcuts.ts';

/** True when the engine is there; otherwise skips (locally) or throws (CI). */
export function requireMarkdownEngine(t) {
	if (existsSync(`${ROOT}${ENGINE_ENTRY}`)) return true;
	const message = `SKIP osionos#240: ${ENGINE_ENTRY} is missing (submodule not initialised); this test compared nothing.`;
	if (process.env.CI || process.env.OSIONOS_REQUIRE_MARKDOWN_ENGINE === '1') throw new Error(message.replace('SKIP', 'FAIL'));
	console.warn(`\n${'!'.repeat(8)} ${message}\n`);
	t.skip(message.replace(/^SKIP /, ''));
	return false;
}

export { ROOT };
