/* ************************************************************************** */

// The welcome is a frosted card on a transparent pane, with a fallback where
// blur is off, and the pencil sketch is gone.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/widgets/workspace-grid/ui/emptyWorkspace.css", "utf8");
const paneView = readFileSync("src/widgets/workspace-grid/ui/PaneView.tsx", "utf8");

test("the card blurs its backdrop, with the WebKit prefix too", () => {
  assert.match(css, /(^|[^-])backdrop-filter:\s*blur\(18px\)/m);
  assert.match(css, /-webkit-backdrop-filter:\s*blur\(18px\)/);
});

test("reduced transparency, forced colors and no-support fall back to a solid surface", () => {
  const reduced = css.match(/@media \(prefers-reduced-transparency: reduce\), \(forced-colors: active\) \{[\s\S]*?\n\}/);
  assert.ok(reduced, "reduced-transparency block");
  assert.match(reduced[0], /background: var\(--osio-bg-surface\)/);
  assert.match(reduced[0], /backdrop-filter: none/);
  const unsupported = css.match(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{[\s\S]*?\n\}/);
  assert.ok(unsupported, "@supports not block");
  assert.match(unsupported[0], /background: var\(--osio-bg-surface\)/);
});

test("nothing loops, and the sketch is gone", () => {
  assert.doesNotMatch(css, /infinite/);
  assert.doesNotMatch(css, /sketch/);
});

test("PaneView marks the chromeless welcome pane", () => {
  assert.match(paneView, /data-osio-pane-welcome/);
});
