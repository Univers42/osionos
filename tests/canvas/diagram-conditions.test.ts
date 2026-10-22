// The G3e-2 review conditions on the living diagram: page-id de-duplication,
// honest neighbour counts, a note for every cap, a LIVE public check, no fetch
// without a workspace, a single-diagram unfenced answer, an honest clipboard.

import assert from "node:assert/strict";
import test from "node:test";

import { copyMermaidText } from "@/features/diagram/model/diagramExport";
import { graphSource } from "@/features/diagram/model/graphSource";
import { neighbourhood, pageGraph } from "@/features/diagram/model/graphInput";
import { mermaidFromAnswer } from "@/features/diagram/model/mermaidAnswer";
import { fetchBridgeGraph } from "@/features/graph-studio/api/fetchBridgeGraph";

const PAGE_A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const SPEC = { kind: "graph", pageId: PAGE_A, depth: 1, kinds: [] };

/** Run a body with a fake `location`, restoring the real one after. */
async function withLocation<T>(pathname: string, body: () => Promise<T>): Promise<T> {
  const holder = globalThis as unknown as { location?: unknown };
  const previous = holder.location;
  holder.location = { pathname };
  try {
    return await body();
  } finally {
    holder.location = previous;
  }
}

test("C109: dropped counts every neighbour not shown, across both levels", () => {
  const pages = [{ id: "c", title: "Centre" }];
  const edges = [];
  for (let index = 0; index < 50; index += 1) {
    const id = `n${String(index).padStart(3, "0")}`;
    pages.push({ id, title: id });
    edges.push({ from: "c", to: id, kind: "link" as const });
    // One second-level page behind each first-level one.
    pages.push({ id: `${id}x`, title: `${id}x` });
    edges.push({ from: id, to: `${id}x`, kind: "link" as const });
  }
  const hood = neighbourhood({ pages, edges }, "c", 2);
  assert.equal(hood.neighbors.length, 40);
  assert.equal(hood.truncated, true);
  assert.equal(hood.neighbors.length + hood.dropped, 100);
});

test("C109: a capped neighbourhood names what it holds less of", async () => {
  const node = (id: string) => `osionos:osionos_pages:${id}`;
  const nodes = [{ id: node(PAGE_A), data: { title: "Centre" } }];
  const edges = [];
  for (let index = 0; index < 50; index += 1) {
    const id = `p${String(index).padStart(3, "0")}`;
    nodes.push({ id: node(id), data: { title: id } });
    edges.push({ from: node(PAGE_A), to: node(id), type: "link" });
  }
  const out = await withLocation("/app", () =>
    graphSource(SPEC, {
      isPublic: false,
      jwt: "t",
      fetchGraph: async () => ({ nodes, edges }) as never,
    }),
  );
  assert.equal(out.source.truncated, true);
  assert.equal(out.source.truncatedNote, "Showing 40 of 50 neighbours");
});

test("C110: a page that became public after the first render fetches nothing", async () => {
  let fetched = 0;
  const out = await withLocation("/p/abc", () =>
    graphSource(
      SPEC,
      {
        isPublic: false,
        jwt: "t",
        fetchGraph: async () => {
          fetched += 1;
          return { nodes: [], edges: [] } as never;
        },
      },
    ),
  );
  assert.equal(fetched, 0);
  assert.equal(out.source.source, null);
});

test("C99: no workspace id, no read of the unscoped graph route", async () => {
  const holder = globalThis as unknown as Record<string, unknown>;
  const previousStore = holder.__playgroundUserStore;
  const previousFetch = holder.fetch;
  let calls = 0;
  holder.__playgroundUserStore = { getState: () => ({ activeJwt: () => "jwt", activePageJwt: () => "jwt" }) };
  holder.fetch = async () => {
    calls += 1;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    assert.equal(await fetchBridgeGraph("workspace", ""), null);
    assert.equal(calls, 0);
  } finally {
    holder.__playgroundUserStore = previousStore;
    holder.fetch = previousFetch;
  }
});

test("C7: an unfenced diagram followed by prose is not a diagram; a plain diagram still is", () => {
  assert.equal(
    mermaidFromAnswer("flowchart LR\n  A --> B\n\nHope this helps, tell me if you want changes."),
    null,
  );
  assert.equal(mermaidFromAnswer("flowchart LR\n  A --> B\nThis shows the flow of the page."), null);
  assert.equal(mermaidFromAnswer("flowchart LR\n  A --> B\n  B --> C"), "flowchart LR\n  A --> B\n  B --> C");
});

test("C9: copyMermaidText tells no clipboard from nothing to copy", async () => {
  assert.equal(await copyMermaidText({ isPublic: false, source: "flowchart LR", clipboard: null }), "unavailable");
  assert.equal(await copyMermaidText({ isPublic: false, source: "", clipboard: null }), "empty");
});
