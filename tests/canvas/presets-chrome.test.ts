// presets.css, the sheet that makes each style visible on the chrome: loaded after surface.css,
// its gap and pane-shadow overrides stay off phones and compact, it never redefines the base
// surface token, never blurs or animates, and the frosted look has a solid fallback.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("src/app/styles/presets.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The selector of every rule declaring `property`, with the media query around it. */
function rulesDeclaring(property: string): { media: string; selector: string }[] {
  const found: { media: string; selector: string }[] = [];
  const pattern = /(@media[^{]*)\{((?:[^{}]*\{[^}]*\})*)\s*\}|([^{}@]+)\{([^}]*)\}/g;
  for (const match of css.matchAll(pattern)) {
    if (match[1]) {
      for (const inner of match[2].matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        if (inner[2].includes(property)) found.push({ media: match[1], selector: inner[1].trim() });
      }
    } else if (match[4].includes(property)) {
      found.push({ media: "", selector: match[3].trim() });
    }
  }
  return found;
}

test("presets.css loads right after surface.css", () => {
  const global = readFileSync("src/app/styles/global.css", "utf8");
  assert.match(global, /@import "\.\/surface\.css";\n@import "\.\/presets\.css";/);
});

test("the frame gap and pane shadow change only on desktop, outside compact", () => {
  const rules = [...rulesDeclaring("--osio-frame-gap"), ...rulesDeclaring("--osio-pane-shadow")];
  assert.ok(rules.length >= 2);
  for (const { media, selector } of rules) {
    assert.match(media, /width > 767\.98px/, selector);
    assert.match(selector, /:not\(\[data-density="compact"\]\)/, selector);
  }
});

test("no blur, no animation, and the base surface token is never redefined", () => {
  assert.doesNotMatch(css, /backdrop-filter|animation|transition|background-attachment/);
  assert.doesNotMatch(css, /--osio-bg-surface\s*:/);
});

test("the translucent frosted chrome has a solid fallback for reduced transparency and forced colours", () => {
  const fallback = css.slice(css.indexOf("@media (prefers-reduced-transparency: reduce), (forced-colors: active)"));
  assert.ok(fallback.length > 0);
  for (const target of ["[data-osio-shell]", '[data-testid="app-topbar"]', "[data-osio-sidebar-card]"]) {
    assert.ok(fallback.includes(target), target);
  }
});

test("the peek sidebar is never made translucent", () => {
  for (const { selector } of rulesDeclaring("background-color")) {
    if (selector.includes("data-osio-sidebar-card") && !selector.includes("aside [")) {
      assert.match(selector, /aside:not\(\[data-sidebar-mode="peek"\]\)/, selector);
    }
  }
});
