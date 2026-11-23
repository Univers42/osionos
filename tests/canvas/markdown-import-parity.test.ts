// osionos#240 M240-10: the bridge's committed bundle and the TypeScript the editor imports
// produce byte-identical blocks for the same Markdown. Block ids are random UUIDs on both
// sides, so every UUID is replaced by its order of first appearance before comparing.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fuzzDocument, parityCorpus } from "../fixtures/markdown-import/corpus.mjs";
import { requireMarkdownEngine, ROOT } from "../fixtures/markdown-import/engine-presence.mjs";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

type Convert = (markdown: string) => unknown;

function normalisedJson(blocks: unknown): string {
  const seen = new Map<string, string>();
  return JSON.stringify(blocks).replace(UUID, (id) => {
    if (!seen.has(id)) seen.set(id, `<id-${seen.size}>`);
    return seen.get(id) as string;
  });
}

async function converters(): Promise<{ source: Convert; bundle: Convert }> {
  const source = await import(`${ROOT}src/entities/block/model/markdownImport.ts`);
  const bundle = await import(`${ROOT}scripts/bridge-markdown-engine.mjs`);
  return { source: source.markdownImportBlocks, bundle: bundle.markdownImportBlocks };
}

function fuzzCorpus(count: number): Array<[string, string]> {
  const state = { seed: 240 };
  return Array.from({ length: count }, (_, index) => [`fuzz:${index}`, fuzzDocument(state, 1 + (index % 400))]);
}

describe("markdown import parity: bundle vs TypeScript source (M240-10)", () => {
  it("covers at least 30 documents", () => {
    assert.ok(parityCorpus().length >= 30, `corpus has ${parityCorpus().length}`);
  });

  it("produces the same JSON for every corpus document", async (t) => {
    if (!requireMarkdownEngine(t)) return;
    const { source, bundle } = await converters();
    for (const [name, markdown] of [...parityCorpus(), ...fuzzCorpus(300)]) {
      assert.equal(normalisedJson(bundle(markdown)), normalisedJson(source(markdown)), name);
    }
  });

  it("is the function the editor's file import calls", async (t) => {
    if (!requireMarkdownEngine(t)) return;
    const { importPageFile } = await import(`${ROOT}src/services/page-actions/index.ts`);
    const { bundle } = await converters();
    const markdown = "# Plan\n\n- a [link](https://example.com)\n";
    const imported = await importPageFile(new File([markdown], "Plan.md"));
    assert.equal(normalisedJson(imported.content), normalisedJson(bundle(markdown)));
  });
});
