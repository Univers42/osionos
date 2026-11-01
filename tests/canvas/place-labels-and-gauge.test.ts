import assert from "node:assert/strict";
import { test } from "node:test";
import { safeString } from "../../src/shared/notion-database-sys/src/utils/safeString.ts";
import { resolveGroupKeys } from "../../src/shared/notion-database-sys/src/lib/chart/chartKeys.ts";
import { buildGauge } from "../../src/shared/notion-database-sys/src/components/views/chart/echarts/echartsBuildersRound.ts";

// #254: board columns and chart legends read {"address":"Valencia","lat":39.47,…}.
test("a place reads as its address, an ordinary object stays JSON", () => {
  assert.equal(safeString({ address: "Valencia", lat: 39.47, lng: -0.38 }), "Valencia");
  assert.equal(safeString({ address: "" }), '{"address":""}');
  assert.equal(safeString({ a: 1 }), '{"a":1}');
});

test("a chart grouped on a place labels it by name", () => {
  const prop = { id: "city", name: "City", type: "place" } as never;
  const page = { id: "p", properties: { city: { address: "Oslo", lat: 59.9, lng: 10.7 } } } as never;
  const [group] = resolveGroupKeys(page, prop);
  assert.equal(group.label, "Oslo");
});

// #265: the gauge printed 2955201.26 beside tiles that read 3.0M.
test("a gauge groups its digits", () => {
  const option = buildGauge({
    result: { total: 2955201.26 }, settings: {}, def: { id: "gauge" }, colors: ["#000"],
  } as never) as { series: { detail: { formatter: (value: number) => string } }[] };
  assert.equal(option.series[0].detail.formatter(2955201.26), (2955201.26).toLocaleString(undefined, { maximumFractionDigits: 2 }));
  assert.notEqual(option.series[0].detail.formatter(2955201.26), "2955201.26");
});
