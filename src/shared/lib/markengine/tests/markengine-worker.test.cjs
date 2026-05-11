const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createNodeMarkEngineWorkerClient,
  parseMarkdown,
  renderHtml,
  renderSource,
} = require("../dist/markdown.js");

test("MarkEngineWorker runs parse, render, and incremental operations in a node worker", async () => {
  const source = "# Worker\n\nA **large-ish** document for the worker.";
  const worker = createNodeMarkEngineWorkerClient({ syncThresholdBytes: 0 });

  try {
    const parsed = await worker.parse(source, { documentVersion: 7 });
    assert.equal(parsed.ast.version, 7);
    assert.equal(parsed.ast.children.length, 2);
    assert.deepEqual(parsed, parseMarkdown(source, { documentVersion: 7 }));

    const html = await worker.renderHtml(parsed.ast, {}, {
      sourceByteLength: 1024 * 1024,
    });
    assert.equal(html, renderHtml(parsed.ast));
    assert.match(html, /<strong[^>]*>large-ish<\/strong>/);

    const sourceView = await worker.renderSource(source);
    assert.equal(sourceView, renderSource(source));

    const next = await worker.incrementalParse(source, parsed, {
      fromLine: 2,
      toLine: 2,
      text: "A **worker-backed** document for the worker.",
    });
    assert.match(renderHtml(next.ast), /worker-backed/);
    assert.equal(next.changedNodeIds.length, 1);
  } finally {
    worker.dispose();
  }
});