import assert from "node:assert/strict";
import test from "node:test";

import { rewriteSiblingSelectors } from "../../scripts/vite/siblingSelectors.ts";

test("the class moves out of :where so the ancestor filter can reject on it", () => {
  assert.equal(
    rewriteSiblingSelectors(":where(.space-y-1>:not(:last-child)){margin:0}"),
    ":where(.space-y-1)>:where(:not(:last-child)){margin:0}",
  );
});

test("escaped and arbitrary-value classes stay whole", () => {
  assert.equal(
    rewriteSiblingSelectors(":where(.divide-\\[var\\(--osio-border-default\\)\\]>:not(:last-child)){a:b}"),
    ":where(.divide-\\[var\\(--osio-border-default\\)\\])>:where(:not(:last-child)){a:b}",
  );
  assert.equal(
    rewriteSiblingSelectors(":where(.sm\\:space-y-0\\.5>:not(:last-child)){a:b}"),
    ":where(.sm\\:space-y-0\\.5)>:where(:not(:last-child)){a:b}",
  );
});

test("every occurrence is rewritten", () => {
  assert.equal(
    rewriteSiblingSelectors(":where(.a>:not(:last-child)){x:1}:where(.b>:not(:last-child)){y:2}"),
    ":where(.a)>:where(:not(:last-child)){x:1}:where(.b)>:where(:not(:last-child)){y:2}",
  );
});

test("every other selector is left alone", () => {
  for (const css of [
    ".leaflet-control-scale-line:not(:first-child):not(:last-child){a:b}",
    ":where(.a .b>:not(:last-child)){a:b}",
    ":where(.a>:not(:first-child)){a:b}",
    ".a>:not(:last-child){a:b}",
  ]) {
    assert.equal(rewriteSiblingSelectors(css), css);
  }
});
