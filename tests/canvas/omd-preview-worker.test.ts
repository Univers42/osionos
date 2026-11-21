
// Issue #320: the .omd preview parses in the markdown preview's worker queue (ADR 0009 D2),
// not in RawPreviewPane's render. Fake workers run the real worker body, as in
// markdown-preview-worker.test.ts.
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { answerPreviewRequest, parsePagePreview, PREVIEW_MAX_CHARS, type PreviewRequest } from "@/features/ide/model/previewDocument";
import { PREVIEW_PARSE_BUDGET_MS, PreviewParseQueue, type PreviewState } from "@/features/ide/model/previewParseQueue";
import { OmdDocumentView } from "@/features/ide/ui/OmdDocumentView";
import { MarkdownDocumentView } from "@/features/ide/ui/MarkdownDocumentView";
import { fileToPage } from "@/features/page-file/model/pageFileCodec";
import { omdBody, omdPreviewContent } from "@/features/page-file/model/omdPreviewContent";

const OMD = [
  "---",
  'title: "Plan"',
  'blocks: {"0":{"t":"heading_1","id":"h1"},"1":{"t":"paragraph","id":"p1"}}',
  "---",
  "",
  "# Plan",
  "",
  "A paragraph with **bold** and a [link](https://example.com).",
  "",
  "- one",
  "- two",
  "",
  "```ts",
  "const a = 1;",
  "```",
  "",
].join("\n");

class AnsweringWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  received: PreviewRequest[] = [];

  postMessage(request: PreviewRequest) {
    this.received.push(structuredClone(request));
    answerPreviewRequest(structuredClone(request), (response) => this.onmessage?.({ data: structuredClone(response) }));
  }

  terminate() {}
}

class SilentWorker extends AnsweringWorker {
  postMessage(request: PreviewRequest) {
    this.received.push(structuredClone(request));
  }
}

// Blocks mint fresh ids on every parse; the overlay pins only the ones it names.
const withoutIds = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, item) => (key === "id" ? undefined : item)));

test.beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
test.afterEach(() => mock.timers.reset());

test("the .omd body is parsed by the worker, and the main thread only assembles it (#320)", () => {
  const worker = new AnsweringWorker();
  const states: PreviewState[] = [];
  const queue = new PreviewParseQueue(() => worker as unknown as Worker, (state) => states.push(state));
  queue.request(omdBody(OMD), "alt", "page");
  assert.equal(worker.received.length, 1);
  assert.equal(worker.received[0].parse, "page");
  assert.equal(states.length, 1);
  const content = omdPreviewContent(OMD, states[0]);
  assert.ok(content, "the worker's answer carries the page blocks");
  assert.deepEqual(withoutIds(content), withoutIds(fileToPage(OMD).content));
  assert.equal(content[0].id, "h1", "the overlay is applied on the main thread");
});

test("the main thread does not parse the body when the worker's blocks are supplied (#320)", () => {
  const sentinel = [{ id: "s", type: "paragraph", content: "FROM THE WORKER" }];
  const content = fileToPage("# parsed on the main thread\n", undefined, sentinel as never).content;
  assert.deepEqual(withoutIds(content), withoutIds(sentinel));
});

test("a page parse over the budget ends tooSlow, shown as the .md preview shows it, with no fallback (#320)", () => {
  const worker = new SilentWorker();
  const states: PreviewState[] = [];
  const queue = new PreviewParseQueue(() => worker as unknown as Worker, (state) => states.push(state));
  queue.request(omdBody(OMD), "alt", "page");
  mock.timers.tick(PREVIEW_PARSE_BUDGET_MS);
  assert.deepEqual(states, [{ kind: "tooSlow" }]);
  assert.equal(omdPreviewContent(OMD, states[0]), null);
  const omd = renderToStaticMarkup(React.createElement(OmdDocumentView, { source: OMD, state: states[0] }));
  const md = renderToStaticMarkup(React.createElement(MarkdownDocumentView, { state: states[0] }));
  assert.equal(omd, md);
  assert.match(omd, /takes more than 3 s/);
});

test("a page request and a markdown request for the same text are different jobs (#320)", () => {
  const worker = new AnsweringWorker();
  const queue = new PreviewParseQueue(() => worker as unknown as Worker, () => {});
  queue.request("# A", "alt");
  queue.request("# A", "alt", "page");
  assert.deepEqual(worker.received.map((sent) => sent.parse), ["markdown", "page"]);
});

test("an engine throw falls back to the body as one raw paragraph, as fileToPage did (#320)", () => {
  const body = "# not rendered\n";
  const shown = parsePagePreview(body, () => {
    throw new RangeError("engine blew up");
  });
  assert.equal(shown.ok, true);
  assert.ok("pageBlocks" in shown);
  assert.deepEqual(withoutIds(shown.pageBlocks), [{ type: "paragraph", content: body }]);
});

test("a body over the cap is tooLarge, and its notice says the Code view still edits it (#320)", () => {
  const huge = "a".repeat(PREVIEW_MAX_CHARS + 1);
  const shown = parsePagePreview(huge);
  assert.deepEqual(shown, { ok: false, reason: "tooLarge" });
  const html = renderToStaticMarkup(React.createElement(OmdDocumentView, { source: huge, state: { kind: "ready", document: shown } }));
  assert.match(html, /up to 1 MiB\. The Code view still edits it\./);
});

test("a stale answer is never delivered after a newer request, nor after dispose (#320)", () => {
  const worker = new SilentWorker();
  const states: PreviewState[] = [];
  const queue = new PreviewParseQueue(() => worker as unknown as Worker, (state) => states.push(state));
  queue.request("# A", "alt", "page");
  const handler = worker.onmessage;
  assert.ok(handler);
  const oldId = worker.received[0].id;
  queue.request("# B", "alt", "page");
  handler({ data: { id: oldId - 1, document: parsePagePreview("# A") } });
  assert.deepEqual(states, [], "an id that is not in flight is dropped");
  queue.dispose();
  handler({ data: { id: oldId, document: parsePagePreview("# A") } });
  assert.deepEqual(states, [], "nothing is delivered after dispose");
});
