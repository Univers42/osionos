/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-run-stream.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The run stream: the frames arrive once, a dropped stream is picked up again,
 * and a run that cannot be picked up ends the run — once.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { streamRun } from "@/features/ai/model/runStream";
import { retryAfterOf } from "@/features/chat/model/runErrors";

/** One SSE frame, numbered the way the service numbers them. */
function frame(id: string, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A response whose body carries the frames in order, then ends. */
function streamResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const one of frames) controller.enqueue(encoder.encode(one));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** What the sink saw: the events, the texts and the ids. */
interface Seen {
  events: string[];
  texts: string[];
  ids: string[];
  sink: (event: string, data: Record<string, unknown>, id?: string) => void;
}

function seen(): Seen {
  const events: string[] = [];
  const texts: string[] = [];
  const ids: string[] = [];
  return {
    events,
    texts,
    ids,
    sink: (event, data, id) => {
      events.push(event);
      ids.push(id ?? "");
      if (event === "text.delta" && typeof data.text === "string") texts.push(data.text);
    },
  };
}

/** The waits the run asked for, and the resume cursors it used. */
interface Calls {
  resumed: (string | undefined)[];
  waits: number[];
}

function calls(): Calls {
  return { resumed: [], waits: [] };
}

/** A run whose first request failed: what the caller caught, and what was tried. */
interface Refused {
  /** The error the caller caught, when the run threw one. */
  thrown: unknown;
  /** The resumes the run tried. */
  tracker: Calls;
  /** The frames the sink saw. */
  sink: Seen;
}

/**
 * Runs a run whose first request fails with `error`.
 *
 * The refusal is caught, so the caller can be looked at: a run that threw
 * is a refusal, a run that resumed is a connection that dropped.
 */
async function refused(error: unknown): Promise<Refused> {
  const sink = seen();
  const tracker = calls();
  let thrown: unknown = null;
  try {
    await streamRun({
      start: async () => {
        throw error;
      },
      resume: async (lastEventId) => {
        tracker.resumed.push(lastEventId);
        return streamResponse([]);
      },
      onEvent: sink.sink,
      sleep: async (ms) => {
        tracker.waits.push(ms);
      },
    });
  } catch (caught) {
    thrown = caught;
  }
  return { thrown, tracker, sink };
}

test("the run relays its frames in order and stops at done", async () => {
  const sink = seen();
  const tracker = calls();

  await streamRun({
    start: async () =>
      streamResponse([
        frame("1", "run.started", { runId: "r1" }),
        frame("2", "text.delta", { text: "Hel" }),
        frame("3", "text.delta", { text: "lo" }),
        frame("4", "done", { runId: "r1" }),
      ]),
    resume: async (lastEventId) => {
      tracker.resumed.push(lastEventId);
      return streamResponse([]);
    },
    onEvent: sink.sink,
    sleep: async (ms) => {
      tracker.waits.push(ms);
    },
  });

  assert.deepEqual(sink.events, ["run.started", "text.delta", "text.delta", "done"]);
  assert.deepEqual(sink.texts, ["Hel", "lo"]);
  assert.deepEqual(sink.ids, ["1", "2", "3", "4"]);
  assert.deepEqual(tracker.resumed, [], "a run that ends on done is never resumed");
});

test("a dropped stream is resumed after the last frame, and no frame arrives twice", async () => {
  const sink = seen();
  const tracker = calls();

  await streamRun({
    start: async () =>
      streamResponse([
        frame("1", "text.delta", { text: "Hello" }),
        frame("2", "text.delta", { text: " " }),
        frame("3", "text.delta", { text: "world" }),
      ]),
    resume: async (lastEventId) => {
      tracker.resumed.push(lastEventId);
      // The service answers with the last frame it knows plus the new ones.
      return streamResponse([
        frame("3", "text.delta", { text: "world" }),
        frame("4", "text.delta", { text: "!" }),
        frame("5", "done", { runId: "r1" }),
      ]);
    },
    onEvent: sink.sink,
    sleep: async (ms) => {
      tracker.waits.push(ms);
    },
  });

  assert.deepEqual(tracker.resumed, ["3"], "the resume starts after the last frame we saw");
  assert.deepEqual(sink.texts, ["Hello", " ", "world", "!"], "no text is delivered twice");
  assert.deepEqual(sink.ids, ["1", "2", "3", "4", "5"], "the repeated frame is dropped");
  assert.deepEqual(tracker.waits, [500], "one wait before the first resume");
});

test("a 410 on resume ends the run with run_expired", async () => {
  const sink = seen();
  const tracker = calls();

  await streamRun({
    start: async () => streamResponse([frame("1", "text.delta", { text: "Hel" })]),
    resume: async (lastEventId) => {
      tracker.resumed.push(lastEventId);
      throw Object.assign(new Error("gone"), { status: 410, code: "run_expired" });
    },
    onEvent: sink.sink,
    sleep: async (ms) => {
      tracker.waits.push(ms);
    },
  });

  const last = sink.events.at(-1);
  assert.equal(last, "error");
  assert.deepEqual(tracker.resumed, ["1"], "the expired run is not resumed again");
});

test("three failed resumes end the run, and there is no fourth", async () => {
  const sink = seen();
  const tracker = calls();

  await streamRun({
    start: async () => streamResponse([frame("1", "text.delta", { text: "Hel" })]),
    resume: async (lastEventId) => {
      tracker.resumed.push(lastEventId);
      throw new Error("network is down");
    },
    onEvent: sink.sink,
    sleep: async (ms) => {
      tracker.waits.push(ms);
    },
  });

  assert.equal(tracker.resumed.length, 3, "three resumes, no more");
  assert.deepEqual(tracker.waits, [500, 1000, 2000], "the waits between the resumes");
  assert.equal(sink.events.at(-1), "error", "the run ends with an error");
});

test("an abort stops the run quietly", async () => {
  const sink = seen();
  const controller = new AbortController();
  const tracker = calls();

  await streamRun({
    start: async () => {
      controller.abort();
      return streamResponse([frame("1", "text.delta", { text: "Hel" })]);
    },
    resume: async (lastEventId) => {
      tracker.resumed.push(lastEventId);
      return streamResponse([]);
    },
    onEvent: sink.sink,
    signal: controller.signal,
    sleep: async (ms) => {
      tracker.waits.push(ms);
    },
  });

  assert.deepEqual(tracker.resumed, [], "an aborted run is not resumed");
  assert.ok(!sink.events.includes("error"), "a stop is not a failure");
});

test("a refusal on the first request is thrown to the caller, never resumed", async () => {
  const error = Object.assign(new Error("the budget is used up"), {
    status: 402,
    code: "budget_exhausted",
  });
  const { thrown, tracker, sink } = await refused(error);

  assert.equal(thrown, error, "the refusal reaches the caller as it is");
  assert.deepEqual(tracker.resumed, [], "a refused run is never resumed");
  assert.ok(!sink.events.includes("error"), "a refusal is not an error frame");
});

test("a rate limit on the first request keeps the seconds of its countdown", async () => {
  const error = Object.assign(new Error("too many requests"), {
    status: 429,
    code: "rate_limited",
    headers: new Headers({ "retry-after": "17" }),
  });
  const { thrown, tracker } = await refused(error);

  assert.equal(thrown, error, "the refusal reaches the caller as it is");
  assert.deepEqual(tracker.resumed, [], "a refused run is never resumed");
  assert.equal(retryAfterOf(thrown), 17, "the seconds of the countdown are kept");
});

test("a network failure on the first request is resumed, not thrown", async () => {
  const { thrown, tracker, sink } = await refused(new TypeError("fetch failed"));

  assert.equal(thrown, null, "the run keeps going");
  assert.equal(tracker.resumed.length, 3, "the run is resumed three times");
  assert.equal(sink.events.at(-1), "error", "the run ends with an error");
});

test("a 503 on the first request is resumed, not thrown", async () => {
  const error = Object.assign(new Error("the service is busy"), { status: 503 });
  const { thrown, tracker, sink } = await refused(error);

  assert.equal(thrown, null, "the run keeps going");
  assert.equal(tracker.resumed.length, 3, "the run is resumed three times");
  assert.equal(sink.events.at(-1), "error", "the run ends with an error");
});
