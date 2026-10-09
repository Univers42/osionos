// The bridge → <graph-studio> adapter (src/features/graph-studio/model/toIngestDoc.ts).
// Pure checks, no browser page. The oracle at the bottom re-states what graph_render's
// ingest refuses at groot's pin 77b68d9b (packages/graph-studio/src/source/ingest.ts):
// a duplicate node or edge id, a dangling endpoint, an unknown kind, and a missing member
// (which the element would fill and report as a note).

import { expect, test } from "@playwright/test";

import {
  type BridgeGraph,
  type IngestDoc,
  pageIdOf,
  pageNodeId,
  toIngestDoc,
} from "../../src/features/graph-studio/model/toIngestDoc.ts";

const A = "osionos:osionos_pages:aaaaaaaa-0000-4000-8000-000000000001";
const B = "osionos:osionos_pages:aaaaaaaa-0000-4000-8000-000000000002";

function page(id: string, title: string, extra: Record<string, unknown> = {}) {
  return { id, mount: "osionos", resource: "osionos_pages", pk: id.split(":")[2], data: { title, kind: "page", ...extra } };
}

test("T1/T2: a duplicate node or edge id keeps the first and is counted", () => {
  const { doc, dropped } = toIngestDoc({
    nodes: [page(A, "first"), page(A, "second"), page(B, "b")],
    edges: [
      { id: "e", from: B, to: A, type: "relation" },
      { id: "e", from: A, to: B, type: "relation" },
    ],
  });
  expect(doc.nodes.map((n) => [n.id, n.label])).toEqual([[A, "first"], [B, "b"]]);
  expect(doc.edges.map((e) => [e.id, e.source])).toEqual([["e", B]]);
  expect(dropped).toEqual({ dupNodes: 1, dupEdges: 1, dangling: 0 });
});

test("T3: an edge to or from an absent node is dropped and counted", () => {
  const { doc, dropped } = toIngestDoc({
    nodes: [page(A, "a")],
    edges: [
      { id: "out", from: A, to: "osionos:osionos_pages:ghost", type: "parent" },
      { id: "in", from: "db:orders:9", to: A, type: "relation" },
    ],
  });
  expect(doc.edges).toEqual([]);
  expect(dropped).toEqual({ dupNodes: 0, dupEdges: 0, dangling: 2 });
});

test("T4: kind is always explicit, and only child→parent spellings are child_first", () => {
  const types = ["parent", "PARENT", "child_of", "parent_of", "x_hierarchy_y", "note_link", "links_to", "note_of", "annotates", "tagged", "relation", "fk_owner", undefined];
  const { doc } = toIngestDoc({
    nodes: [page(A, "a"), page(B, "b")],
    edges: types.map((type, i) => ({ id: `e${i}`, from: A, to: B, type })),
  });
  expect(doc.edges.map((e) => [e.kind, e.child_first, e.directed])).toEqual([
    ["hierarchy", true, true],
    ["hierarchy", true, true],
    ["hierarchy", true, true],
    ["hierarchy", false, true],
    ["hierarchy", false, true],
    ["note_link", false, false],
    ["note_link", false, false],
    ["note_of", false, false],
    ["note_of", false, false],
    ["tag", false, false],
    ["relation", false, false],
    ["relation", false, false],
    ["relation", false, false],
  ]);
});

test("T5/T6: every member is written, snake_case, nulls explicit, version as epoch ms", () => {
  const { doc } = toIngestDoc({
    nodes: [
      page(A, "Home", { icon: "🏠", updatedAt: "2026-10-01T10:00:00.000Z" }),
      { id: "osionos:osionos_pages:f1", mount: "osionos", resource: "folders", pk: "f1", data: { title: "Docs", kind: "folder", updatedAt: "nope" } },
      { id: "osionos:tags:work", mount: "osionos", resource: "tags", pk: "work", data: { name: "work" } },
      { id: "db1:orders:7", mount: "db1", resource: "orders", pk: "7", data: {} },
    ],
    edges: [{ id: "t", from: A, to: "osionos:tags:work", type: "tagged" }],
  });
  expect(doc.nodes).toEqual([
    { id: A, kind: "note", database_id: "osionos_pages", source: "osionos", label: "Home", group: "page", weight: 0.5, version: Date.parse("2026-10-01T10:00:00.000Z"), has_note: true, icon: "🏠" },
    { id: "osionos:osionos_pages:f1", kind: "note", database_id: "folders", source: "osionos", label: "Docs", group: "folder", weight: 0.5, version: 0, has_note: true, icon: null },
    { id: "osionos:tags:work", kind: "tag", database_id: "tags", source: "osionos", label: "work", group: "tags", weight: 0.5, version: 0, has_note: false, icon: null },
    { id: "db1:orders:7", kind: "record", database_id: "orders", source: "osionos", label: "7", group: "orders", weight: 0.5, version: 0, has_note: false, icon: null },
  ]);
  expect(doc.edges).toEqual([
    { id: "t", source: A, target: "osionos:tags:work", kind: "tag", label: "tagged", strength: 0.5, directed: false, record_id: null, child_first: false },
  ]);
});

test("T8: page ids round-trip; tag, record and folder-less ids are not pages", () => {
  const id = "aaaaaaaa-0000-4000-8000-000000000009";
  expect(pageIdOf(pageNodeId(id))).toBe(id);
  expect(pageIdOf("osionos:tags:work")).toBeNull();
  expect(pageIdOf("db1:orders:osionos_pages:1")).toBeNull();
  expect(pageIdOf("osionos:osionos_pages:")).toBeNull();
});

test("T9: no graph, or an empty one, is a valid empty document", () => {
  const empty = { doc: { version: 1, nodes: [], edges: [] }, dropped: { dupNodes: 0, dupEdges: 0, dangling: 0 } };
  expect(toIngestDoc(null)).toEqual(empty);
  expect(toIngestDoc({ nodes: [], edges: [] })).toEqual(empty);
});

test("a null node or edge in the bridge's arrays is skipped, not thrown on", () => {
  const graph = { nodes: [null, page(A, "A"), page(B, "B")], edges: [null, { id: "e", from: B, to: A, type: "parent" }] } as unknown as BridgeGraph;
  const { doc, dropped } = toIngestDoc(graph);
  expect(doc.nodes.map((n) => n.id)).toEqual([A, B]);
  expect(doc.edges.map((e) => e.id)).toEqual(["e"]);
  expect(dropped).toEqual({ dupNodes: 0, dupEdges: 0, dangling: 0 });
});

test("an edge with no id gets the bridge's own synthesised id", () => {
  const { doc } = toIngestDoc({ nodes: [page(A, "a"), page(B, "b")], edges: [{ from: A, to: B, type: "relation" }] });
  expect(doc.edges[0]?.id).toBe(`${A}->${B}:relation`);
});

// ── property: any bridge graph adapts to a document the pin's ingest accepts with no note ──

const NODE_MEMBERS = ["id", "kind", "database_id", "source", "label", "group", "weight", "version", "has_note", "icon"];
const EDGE_MEMBERS = ["id", "source", "target", "kind", "label", "strength", "directed", "record_id", "child_first"];
const NODE_KINDS = ["record", "note", "database", "tag"];
const EDGE_KINDS = ["relation", "tag", "note_of", "note_link", "hierarchy"];

/** What the pin's ingest would refuse or annotate in `doc`, or null when it takes it as is. */
function oracle(doc: IngestDoc): string | null {
  if (doc.version !== 1) return "version";
  const ids = new Set<string>();
  for (const n of doc.nodes as unknown as Record<string, unknown>[]) {
    if (Object.keys(n).sort().join() !== [...NODE_MEMBERS].sort().join()) return `node members ${Object.keys(n)}`;
    if (typeof n.id !== "string" || n.id === "" || ids.has(n.id)) return `node id ${String(n.id)}`;
    if (!NODE_KINDS.includes(n.kind as string)) return `node kind ${String(n.kind)}`;
    if (!Number.isFinite(n.weight) || !Number.isFinite(n.version) || typeof n.has_note !== "boolean") return "node scalar";
    ids.add(n.id);
  }
  const edgeIds = new Set<string>();
  for (const e of doc.edges as unknown as Record<string, unknown>[]) {
    if (Object.keys(e).sort().join() !== [...EDGE_MEMBERS].sort().join()) return `edge members ${Object.keys(e)}`;
    if (typeof e.id !== "string" || e.id === "" || edgeIds.has(e.id)) return `edge id ${String(e.id)}`;
    if (!ids.has(e.source as string) || !ids.has(e.target as string)) return `dangling ${String(e.id)}`;
    if (!EDGE_KINDS.includes(e.kind as string)) return `edge kind ${String(e.kind)}`;
    if (typeof e.child_first !== "boolean" || typeof e.directed !== "boolean") return "edge flag";
    edgeIds.add(e.id);
  }
  return null;
}

/** A small seeded PRNG (mulberry32), so a failure names a seed that reproduces it. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomGraph(seed: number): BridgeGraph {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;
  const resources = ["osionos_pages", "folders", "tags", "orders", "people"];
  const ids = Array.from({ length: 1 + Math.floor(r() * 12) }, (_, i) => `m:${pick(resources)}:${i % 7}`);
  const nodes = ids.map((id) => ({ id, resource: id.split(":")[1], pk: id.split(":")[2], data: r() < 0.5 ? { title: `t${id}` } : {} }));
  const ends = [...ids, "m:ghost:1", "m:ghost:2"];
  const types = ["parent", "child_of", "parent_of", "tagged", "relation", "note_link", "hierarchy", "", "weird"];
  const edges = Array.from({ length: Math.floor(r() * 20) }, (_, i) => ({
    id: r() < 0.2 ? undefined : `e${i % 9}`,
    from: pick(ends),
    to: pick(ends),
    type: pick(types),
  }));
  return { nodes, edges };
}

test("property: 200 random bridge graphs adapt to documents the pin's ingest takes with no note", () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const input = randomGraph(seed);
    const { doc, dropped } = toIngestDoc(input);
    expect(oracle(doc), `seed ${seed}`).toBeNull();
    const nodes = input.nodes?.length ?? 0;
    const edges = input.edges?.length ?? 0;
    expect(doc.nodes.length + dropped.dupNodes, `seed ${seed}: every node kept or counted`).toBe(nodes);
    expect(doc.edges.length + dropped.dupEdges + dropped.dangling, `seed ${seed}: every edge kept or counted`).toBe(edges);
  }
});

test("the oracle bites: it refuses a dangling edge, a duplicate id and a missing member", () => {
  const good = toIngestDoc({ nodes: [page(A, "a"), page(B, "b")], edges: [{ id: "e", from: A, to: B, type: "parent" }] }).doc;
  expect(oracle(good)).toBeNull();
  expect(oracle({ ...good, edges: [{ ...good.edges[0]!, target: "nope" }] })).toMatch(/^dangling/);
  expect(oracle({ ...good, nodes: [...good.nodes, good.nodes[0]!] })).toMatch(/^node id/);
  const { icon: _icon, ...missing } = good.nodes[0]!;
  expect(oracle({ ...good, nodes: [missing as never, good.nodes[1]!] })).toMatch(/^node members/);
});
