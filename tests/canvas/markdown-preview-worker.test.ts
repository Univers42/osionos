// The preview's worker queue (devil verdict 2026-11-07 editor-page preview, EP21–EP25), driven
// by fake workers: "answering" ones run the real worker body and deliver through
// structuredClone, as postMessage does; the others answer only when a test says so.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { answerPreviewRequest, parsePreviewDocument, type PreviewRequest } from "@/features/ide/model/previewDocument";
import { PREVIEW_PARSE_BUDGET_MS, PreviewParseQueue, type PreviewState } from "@/features/ide/model/previewParseQueue";
import { MarkdownDocumentView } from "@/features/ide/ui/MarkdownDocumentView";

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  received: PreviewRequest[] = [];
  terminated = 0;
  answering: boolean;

  constructor(answering: boolean) {
    this.answering = answering;
  }

  postMessage(request: PreviewRequest) {
    const copy = structuredClone(request);
    this.received.push(copy);
    if (this.answering) answerPreviewRequest(copy, (response) => this.reply(structuredClone(response)));
  }

  reply(data: unknown) {
    this.onmessage?.({ data });
  }

  answer(source: string) {
    const request = this.received.find((sent) => sent.source === source);
    assert.ok(request, `the worker never received ${source}`);
    this.reply({ id: request.id, document: parsePreviewDocument(source, request.images) });
  }

  terminate() {
    this.terminated += 1;
  }
}

function fakeWorkers(options: { answering?: boolean; throws?: boolean } = {}) {
  const workers: FakeWorker[] = [];
  const create = () => {
    if (options.throws) throw new Error("Worker is not defined");
    workers.push(new FakeWorker(options.answering ?? false));
    return workers.at(-1) as unknown as Worker;
  };
  return { workers, create };
}

function harness(options: { answering?: boolean; throws?: boolean } = {}) {
  const { workers, create } = fakeWorkers(options);
  const states: PreviewState[] = [];
  const queue = new PreviewParseQueue(create, (state) => states.push(state));
  return { queue, workers, states, sources: (index = 0) => workers[index].received.map((sent) => sent.source) };
}

const ready = (source: string): PreviewState => ({ kind: "ready", document: parsePreviewDocument(source, "alt") });

test.beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
test.afterEach(() => mock.timers.reset());

test("a list too deep for postMessage's clone ends tooDeep, not tooSlow or a hang (EP21, G8)", () => {
  // 500 levels: the parser takes it (node 22.23.4 here: up to ~1000 on one line), the clone
  // does not (from ~350). Both preconditions are checked, so the test cannot pass vacuously.
  const deep = `${"- ".repeat(500)}x\n`;
  const parsed = parsePreviewDocument(deep, "alt");
  assert.equal(parsed.ok, true);
  assert.throws(() => structuredClone(parsed), RangeError);
  const { queue, states } = harness({ answering: true });
  queue.request(deep, "alt");
  mock.timers.tick(PREVIEW_PARSE_BUDGET_MS * 2);
  assert.deepEqual(states, [{ kind: "ready", document: { ok: false, reason: "tooDeep" } }]);
});

test("a worker error or messageerror ends unavailable, and nothing runs after it (EP21)", () => {
  for (const event of ["onerror", "onmessageerror"] as const) {
    const { queue, workers, states } = harness();
    queue.request("# A", "alt");
    workers[0][event]?.();
    queue.request("# B", "alt");
    mock.timers.tick(PREVIEW_PARSE_BUDGET_MS * 2);
    assert.deepEqual(states, [{ kind: "unavailable" }], event);
    assert.equal(workers.length, 1, event);
    assert.equal(workers[0].terminated, 1, event);
  }
});

test("a factory that throws shows Preview unavailable, with no main-thread parse (EP22)", () => {
  const { queue, states } = harness({ throws: true });
  queue.request("# Never parsed here", "alt");
  assert.deepEqual(states, [{ kind: "unavailable" }]);
  const html = renderToStaticMarkup(React.createElement(MarkdownDocumentView, { state: states[0] }));
  assert.match(html, /Preview unavailable/);
  assert.doesNotMatch(html, /Never parsed here/);
});

test("sources A (slow), B, C: the worker runs A then C, and C is shown (EP23 i)", () => {
  const { queue, workers, states, sources } = harness();
  for (const source of ["# A", "# B", "# C"]) queue.request(source, "alt");
  assert.deepEqual(sources(), ["# A"]);
  mock.timers.tick(PREVIEW_PARSE_BUDGET_MS - 1);
  workers[0].answer("# A");
  assert.deepEqual(sources(), ["# A", "# C"]);
  // The budget runs from C's post, not from A's.
  mock.timers.tick(PREVIEW_PARSE_BUDGET_MS - 1);
  workers[0].answer("# C");
  assert.deepEqual(states, [ready("# A"), ready("# C")]);
  assert.equal(workers.length, 1);
});

test("an answer for a request that is no longer in flight is dropped (EP23 ii)", () => {
  const { queue, workers, states } = harness();
  queue.request("# A", "alt");
  queue.request("# B", "alt");
  mock.timers.tick(PREVIEW_PARSE_BUDGET_MS);
  workers[0].answer("# A");
  workers[1].reply({ id: workers[0].received[0].id, document: parsePreviewDocument("# A", "alt") });
  assert.deepEqual(states, [{ kind: "tooSlow" }]);
  workers[1].answer("# B");
  assert.deepEqual(states, [{ kind: "tooSlow" }, ready("# B")]);
});

test("A over the budget: terminated once, tooSlow, and a fresh worker runs the pending source (EP23 iii)", () => {
  const { queue, workers, states, sources } = harness();
  queue.request("# A", "alt");
  queue.request("# B", "alt");
  mock.timers.tick(PREVIEW_PARSE_BUDGET_MS);
  assert.equal(workers[0].terminated, 1);
  assert.equal(workers[0].onmessage, null);
  assert.deepEqual(states, [{ kind: "tooSlow" }]);
  assert.equal(workers.length, 2);
  assert.deepEqual(sources(1), ["# B"]);
});

test("every mount's worker is terminated and no timer outlives it, StrictMode's double mount included (EP24)", () => {
  const { workers, create } = fakeWorkers();
  const states: PreviewState[] = [];
  // StrictMode: mount, unmount, mount again, then the real unmount.
  for (let mount = 0; mount < 2; mount += 1) {
    const queue = new PreviewParseQueue(create, (state) => states.push(state));
    queue.request("# A", "alt");
    queue.dispose();
  }
  mock.timers.tick(PREVIEW_PARSE_BUDGET_MS * 2);
  assert.equal(workers.length, 2);
  assert.deepEqual(workers.map((worker) => worker.terminated), [1, 1]);
  assert.ok(workers.every((worker) => worker.onmessage === null && worker.onerror === null && worker.onmessageerror === null));
  assert.deepEqual(states, [], "a timer or a worker outlived its unmount");
});

test("the same source posts once; a new source or image policy posts again (EP25, was EP6)", () => {
  const { queue, workers, sources } = harness();
  queue.request("# Same", "alt");
  queue.request("# Same", "alt");
  workers[0].answer("# Same");
  queue.request("# Same", "alt");
  assert.deepEqual(sources(), ["# Same"]);
  queue.request("# Other", "alt");
  workers[0].answer("# Other");
  queue.request("# Other", "remote");
  assert.deepEqual(workers[0].received.map(({ source, images }) => `${source} ${images}`), ["# Same alt", "# Other alt", "# Other remote"]);
});
