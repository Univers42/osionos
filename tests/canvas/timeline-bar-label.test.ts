/* ************************************************************************** */
/*  timeline-bar-label.test.ts — bar label placement + day rules              */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeBarLabel, getDayRuleClass,
} from "../../src/shared/notion-database-sys/src/components/views/timeline/timelineBarStyles.ts";

test("a short bar sets its title outside; a wide one adds the dates", () => {
  assert.equal(computeBarLabel(54), "outside");
  assert.equal(computeBarLabel(119), "outside");
  assert.equal(computeBarLabel(120), "title");
  assert.equal(computeBarLabel(219), "title");
  assert.equal(computeBarLabel(220), "title+dates");
  // A bar mostly before the range: only its visible width counts.
  assert.equal(computeBarLabel(-40), "outside");
});

test("day zoom rules every day; week and month rule only Mondays", () => {
  const monday = new Date(2026, 6, 6);
  const tuesday = new Date(2026, 6, 7);
  assert.equal(getDayRuleClass(tuesday, "day"), "border-r border-line-light");
  assert.equal(getDayRuleClass(monday, "week"), "border-l border-line-light");
  assert.equal(getDayRuleClass(tuesday, "week"), "");
  assert.equal(getDayRuleClass(tuesday, "month"), "");
});
