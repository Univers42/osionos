// A colour written as a literal in a component stylesheet is invisible to
// every palette. The guard used to know only hex and rgb(), so hsl() or
// oklch() walked straight past it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const GUARD = join(import.meta.dirname, "../../scripts/check-style-tokens.sh");

/** Runs the guard over one stylesheet holding `declaration`; true when it is rejected. */
function isRejected(declaration: string, fileName = "sample.scss"): boolean {
  const root = mkdtempSync(join(tmpdir(), "style-guard-"));
  try {
    writeFileSync(join(root, fileName), `.sample { ${declaration} }\n`);
    const run = spawnSync("bash", [GUARD, root], { encoding: "utf8" });
    assert.ok(run.status === 0 || run.status === 1, `guard crashed: ${run.stderr}`);
    return run.status === 1;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("hex and rgb() literals are rejected, in CSS and in SCSS", () => {
  assert.equal(isRejected("color: #1F5BC4;"), true);
  assert.equal(isRejected("color: #fff;", "sample.css"), true);
  assert.equal(isRejected("color: rgb(31, 91, 196);"), true);
  assert.equal(isRejected("box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);"), true);
});

test("every other colour function with literal channels is rejected", () => {
  assert.equal(isRejected("color: hsl(218 73% 45%);"), true);
  assert.equal(isRejected("color: hsla(218, 73%, 45%, 0.5);"), true);
  assert.equal(isRejected("color: hwb(218 12% 23%);"), true);
  assert.equal(isRejected("color: lab(40% 10 -60);"), true);
  assert.equal(isRejected("color: lch(40% 60 280);"), true);
  assert.equal(isRejected("color: oklab(0.5 0.01 -0.15);"), true);
  assert.equal(isRejected("color: oklch(0.5 0.16 256);"), true);
  assert.equal(isRejected("color: oklch(.5 .16 256);"), true);
  assert.equal(isRejected("color: color(display-p3 0.1 0.3 0.8);"), true);
});

test("a colour built from tokens passes", () => {
  assert.equal(isRejected("color: var(--osio-accent);"), false);
  assert.equal(isRejected("background: color-mix(in oklch, var(--osio-accent) 12%, transparent);"), false);
  assert.equal(isRejected("background: color-mix(in srgb, var(--osio-bg-page), var(--osio-fg-default));"), false);
  assert.equal(isRejected("color: oklch(from var(--osio-accent) l c h);"), false);
  assert.equal(isRejected("transform: scale(0.97); width: calc(100% - 8px);"), false);
});
