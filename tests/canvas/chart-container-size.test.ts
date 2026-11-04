// #293: Recharts' ResponsiveContainer starts at -1×-1 and, before its first measure, logs
// "The width(-1) and height(-1) of chart should be greater than 0" (Home showed it 4 times).
// Every container in the app starts from a positive frame through the shared props.
//
// Caveat: a source scan. It reads each `<ResponsiveContainer` opening tag for a spread of the
// shared props or an `initialDimension`, so a container rendered through an alias or
// React.createElement is not seen (under-reports), and a spread of some other object that
// lacks the field passes when it is named like the shared one.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { RESPONSIVE_CHART_PROPS } from "../../src/shared/lib/charts/responsiveChartProps.ts";

const SRC = new URL("../../src/", import.meta.url);

test("the shared props start the container at a positive size", () => {
  assert.ok(RESPONSIVE_CHART_PROPS.initialDimension.width > 0);
  assert.ok(RESPONSIVE_CHART_PROPS.initialDimension.height > 0);
});

test("every ResponsiveContainer starts from a positive initial dimension", () => {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((entry) => entry.endsWith(".tsx"));
  const bare = files.flatMap((file) => {
    const source = readFileSync(new URL(file, SRC), "utf8");
    return [...source.matchAll(/<ResponsiveContainer\b[^>]*>/g)]
      .filter((match) => !/\{\.\.\.(RESPONSIVE_CHART_PROPS|CHART_CONTAINER_PROPS)\}|initialDimension=/.test(match[0]))
      .map((match) => `${file}:${source.slice(0, match.index).split("\n").length}`);
  });
  assert.deepEqual(bare, [], `ResponsiveContainer without a positive initial size:\n${bare.join("\n")}`);
});
