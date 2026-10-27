import assert from "node:assert/strict";
import { test } from "node:test";

import { createCollabLatencyMarks } from "@/shared/lib/perf/collabLatencyMarks";

function fakeSink() {
  const calls: Array<{ kind: string; name: string; options?: unknown }> = [];
  let clock = 0;
  return {
    calls,
    mark: (name: string, options?: { detail?: unknown }) => {
      calls.push({ kind: "mark", name, options });
      clock += 5;
      return { startTime: clock };
    },
    measure: (name: string, options?: unknown) => { calls.push({ kind: "measure", name, options }); },
  };
}

test("flag off records nothing", () => {
  const sink = fakeSink();
  const marks = createCollabLatencyMarks(false, sink);
  marks.frameReceived();
  marks.blockTextWritten({ textContent: "abc" });
  assert.equal(sink.calls.length, 0);
});

test("flag on: a frame then a DOM write yields two marks and a frame-to-dom measure", () => {
  const sink = fakeSink();
  const marks = createCollabLatencyMarks(true, sink);
  marks.frameReceived();
  marks.blockTextWritten({ textContent: "seven!!" });
  assert.deepEqual(sink.calls.map((c) => `${c.kind}:${c.name}`), ["mark:collab:frame", "mark:collab:dom", "measure:collab:frame-to-dom"]);
  assert.deepEqual(sink.calls[2].options, { start: 5, end: 10, detail: { len: 7 } });
});

test("flag on: a DOM write with no frame yet marks but does not measure", () => {
  const sink = fakeSink();
  createCollabLatencyMarks(true, sink).blockTextWritten({ textContent: "x" });
  assert.deepEqual(sink.calls.map((c) => c.kind), ["mark"]);
});
