/**
 * What the reader is told when a run fails before it ever started: the start's failure,
 * in words that say what to do next.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { streamRun } from "@/features/ai/model/runStream";

test("a run that never started reports why the start failed, not that its resume found nothing", async () => {
  const start = Object.assign(new Error("busy"), { status: 503, code: "upstream_error" });
  const codes: unknown[] = [];

  await streamRun({
    start: async () => {
      throw start;
    },
    resume: async () => {
      throw Object.assign(new Error("no such run"), { status: 404, code: "not_found" });
    },
    onEvent: (event, data) => {
      if (event === "error") codes.push(data.code);
    },
    sleep: async () => undefined,
  });

  assert.deepEqual(codes, ["upstream_error"], "the failure the reader sees is the start's");
});

test("an answer with no code in it still tells the reader what to do", async () => {
  const { errorWords } = await import("@/widgets/chat-shell/ui/errorWords");
  assert.ok(!errorWords("unknown").includes("unknown"), "no raw code in the sentence");
  assert.match(errorWords("unknown"), /try again/i);
});
