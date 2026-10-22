import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  JSON_CANVAS_VISIBILITY_NOTICE,
  MAX_CANVAS_FILE_BYTES,
  elementsToJsonCanvas,
  exportJsonCanvas,
  jsonCanvasToElements,
  parseJsonCanvas,
  type Canvas,
} from "../../src/features/whiteboard/model/jsonCanvas.ts";
import { MAX_IMPORT_ELEMENTS } from "../../src/features/whiteboard/model/boardLimits.ts";
import { IdMinter } from "../../src/features/whiteboard/model/jsonCanvasElements.ts";
import { importJsonCanvas } from "../../src/features/whiteboard/model/jsonCanvasImport.ts";
import { createWhiteboardClient, WhiteboardApiError } from "../../src/features/whiteboard/model/whiteboardClient.ts";
import { JsonCanvasImport } from "../../src/features/whiteboard/ui/JsonCanvasImport.tsx";
import { WhiteboardBoardMenu } from "../../src/features/whiteboard/ui/WhiteboardBlockCard.tsx";

const sample = readFileSync(new URL("./fixtures/sample.canvas", import.meta.url), "utf8");
const storedScene = JSON.parse(
  readFileSync(new URL("./fixtures/legacy-draw-scene.osidraw.json", import.meta.url), "utf8"),
) as { elements: Record<string, unknown>[] };

const parsed = parseJsonCanvas(sample);
assert.equal(parsed.ok, true, "the fixture is a readable canvas");
if (!parsed.ok) throw new Error("unreachable");
const canvas: Canvas = parsed.canvas;

function nodeOf(id: string) {
  const node = canvas.nodes.find((candidate) => candidate.id === id);
  assert.ok(node, `the fixture holds the node ${id}`);
  return node;
}

function edgeOf(id: string) {
  const edge = canvas.edges.find((candidate) => candidate.id === id);
  assert.ok(edge, `the fixture holds the edge ${id}`);
  return edge;
}

test("the fixture reads as a canvas: a group, two texts, a link, a file and three edges", () => {
  assert.deepEqual(
    canvas.nodes.map((node) => [node.id, node.type]),
    [
      ["group-plan", "group"],
      ["text-first", "text"],
      ["text-second", "text"],
      ["link-spec", "link"],
      ["file-roadmap", "file"],
    ],
  );
  assert.equal(canvas.edges.length, 3);
});

test("a canvas becomes board elements: a shape and a bound text per node, a frame per group", () => {
  const { elements, droppedNodes, droppedEdges } = jsonCanvasToElements(canvas);
  assert.equal(droppedNodes, 0);
  assert.equal(droppedEdges, 0);
  // Four nodes with a text each, one frame, three arrows and the label of one edge.
  assert.equal(elements.length, 13);
  const frame = elements.find((element) => element.type === "frame");
  assert.equal(frame?.id, "group-plan");
  assert.equal(frame?.name, "Plan");
  const shape = elements.find((element) => element.id === "text-first");
  assert.equal(shape?.type, "rectangle");
  assert.equal(shape?.boundTextId, "text-first-t");
  const bound = elements.find((element) => element.id === "text-first-t");
  assert.equal(bound?.type, "text");
  assert.equal(bound?.containerId, "text-first");
  assert.equal(bound?.text, "# First\n\nSome markdown, kept as text.");
});

test("the nodes of a group belong to the frame that holds them", () => {
  const { elements } = jsonCanvasToElements(canvas);
  for (const id of ["text-first", "text-second", "link-spec", "file-roadmap"]) {
    assert.equal(elements.find((element) => element.id === id)?.frameId, "group-plan");
  }
});

test("a link and a file stay text: nothing is fetched and nothing is resolved", () => {
  const { elements } = jsonCanvasToElements(canvas);
  assert.equal(elements.find((element) => element.id === "link-spec-t")?.text, "https://jsoncanvas.org/spec/1.0/");
  assert.equal(elements.find((element) => element.id === "file-roadmap-t")?.text, "notes/roadmap.md#quarter-three");
  assert.equal(elements.some((element) => element.embedUrl !== undefined), false);
});

test("an edge becomes an arrow bound at both ends, with its label and its heads", () => {
  const { elements } = jsonCanvasToElements(canvas);
  const arrow = elements.find((element) => element.id === "edge-next");
  assert.equal(arrow?.type, "arrow");
  assert.equal(arrow?.startBinding, "text-first");
  assert.equal(arrow?.endBinding, "text-second");
  assert.equal(arrow?.startArrowhead, "none");
  assert.equal(arrow?.endArrowhead, "arrow");
  assert.equal(elements.find((element) => element.id === "edge-next-t")?.text, "next");
  const both = elements.find((element) => element.id === "edge-both-ends");
  assert.equal(both?.startArrowhead, "arrow");
  assert.equal(both?.endArrowhead, "arrow");
});

test("the sides of an edge are the sides the geometry shows", () => {
  const { elements } = jsonCanvasToElements(canvas);
  const arrow = elements.find((element) => element.id === "edge-next");
  // The arrow leaves the right side of the first node and reaches the left of the second.
  assert.deepEqual(arrow?.points, [
    [0, 0],
    [40, 0],
  ]);
  assert.equal(arrow?.x, 220);
  assert.equal(arrow?.y, 70);
});

test("the colours of a canvas are the board's: a preset, a hex, and the default", () => {
  const { elements } = jsonCanvasToElements(canvas);
  assert.equal(elements.find((element) => element.id === "text-first")?.strokeColor, "#e03131");
  assert.equal(elements.find((element) => element.id === "text-second")?.strokeColor, "#3366ff");
  assert.equal(elements.find((element) => element.id === "edge-both-ends")?.strokeColor, "#1e1e1e");
});

test("the elements carry the field set of a stored scene, and nothing else", () => {
  const { elements } = jsonCanvasToElements(canvas);
  const common = storedScene.elements
    .map((element) => Object.keys(element))
    .reduce((kept, keys) => kept.filter((key) => keys.includes(key)));
  const known = new Set(storedScene.elements.flatMap((element) => Object.keys(element)));
  // The contract's frame fields, which the stored scene does not use: the frame a
  // node belongs to, and the frame's own label.
  known.add("frameId");
  known.add("name");
  for (const element of elements) {
    for (const key of common) assert.ok(key in element, `${element.id} is missing ${key}`);
    for (const key of Object.keys(element)) assert.ok(known.has(key), `${element.id} carries an unknown field ${key}`);
  }
});

test("a board becomes a canvas again, and everything that was read comes back", () => {
  const { elements } = jsonCanvasToElements(canvas);
  const back = elementsToJsonCanvas(elements);

  assert.deepEqual(
    back.nodes.map((node) => node.id),
    canvas.nodes.map((node) => node.id),
  );
  for (const node of canvas.nodes) {
    const round = back.nodes.find((candidate) => candidate.id === node.id);
    assert.ok(round, `${node.id} came back`);
    assert.equal(round.type, node.type);
    assert.equal(round.x, node.x);
    assert.equal(round.y, node.y);
    assert.equal(round.width, node.width);
    assert.equal(round.height, node.height);
    if (node.type === "text") assert.equal(round.text, node.text);
    if (node.type === "link") assert.equal(round.url, node.url);
    if (node.type === "file") {
      assert.equal(round.file, node.file);
      assert.equal(round.subpath, node.subpath);
    }
    if (node.type === "group") assert.equal(round.label, node.label);
  }

  assert.deepEqual(
    back.edges.map((edge) => edge.id),
    canvas.edges.map((edge) => edge.id),
  );
  for (const edge of canvas.edges) {
    const round = back.edges.find((candidate) => candidate.id === edge.id);
    assert.ok(round, `${edge.id} came back`);
    assert.equal(round.fromNode, edge.fromNode);
    assert.equal(round.toNode, edge.toNode);
    assert.equal(round.fromEnd, edge.fromEnd ?? "none");
    assert.equal(round.toEnd, edge.toEnd ?? "arrow");
    if (edge.label !== undefined) assert.equal(round.label, edge.label);
  }
  // The sides of the edge that names them come back as they were written.
  const sides = back.edges.find((edge) => edge.id === "edge-sides");
  assert.equal(sides?.fromSide, "bottom");
  assert.equal(sides?.toSide, "top");
});

test("the colours of a board become the colours of the canvas again", () => {
  const { elements } = jsonCanvasToElements(canvas);
  const back = elementsToJsonCanvas(elements);
  assert.equal(back.nodes.find((node) => node.id === "text-first")?.color, "1");
  assert.equal(back.nodes.find((node) => node.id === "text-second")?.color, "#3366ff");
  assert.equal(back.edges.find((edge) => edge.id === "edge-next")?.color, "2");
});

test("converting twice gives the same scene", () => {
  const first = jsonCanvasToElements(canvas);
  const second = jsonCanvasToElements(canvas);
  assert.deepEqual(first.elements, second.elements);
  assert.deepEqual(elementsToJsonCanvas(first.elements), elementsToJsonCanvas(second.elements));
});

test("a file that is not JSON is refused", () => {
  const result = parseJsonCanvas("this is not a canvas");
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /not JSON/);
});

test("a canvas that is not a canvas is refused", () => {
  const result = parseJsonCanvas(JSON.stringify({ type: "osidraw", elements: [] }));
  assert.equal(result.ok, false);
});

test("two nodes under the same id are refused", () => {
  const twice = JSON.stringify({
    nodes: [
      { id: "a", type: "text", text: "one", x: 0, y: 0, width: 10, height: 10 },
      { id: "a", type: "text", text: "two", x: 0, y: 0, width: 10, height: 10 },
    ],
  });
  const result = parseJsonCanvas(twice);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /share the id/);
});

test("a canvas over the element cap is refused before a board is made", () => {
  const nodes = new Array(MAX_IMPORT_ELEMENTS + 1).fill(0).map((_, index) => ({
    id: `n${index}`,
    type: "text",
    text: "x",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  }));
  const result = parseJsonCanvas(JSON.stringify({ nodes }));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /at most/);
});

test("a text over the contract's cap is refused, never cut", () => {
  const long = "x".repeat(10_001);
  const result = parseJsonCanvas(
    JSON.stringify({ nodes: [{ id: "a", type: "text", text: long, x: 0, y: 0, width: 10, height: 10 }] }),
  );
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.reason : "", /at most/);
});

test("an edge to a node that is not there, and a node of an unknown type, are dropped and counted", () => {
  const odd = parseJsonCanvas(
    JSON.stringify({
      nodes: [
        { id: "a", type: "text", text: "kept", x: 0, y: 0, width: 10, height: 10 },
        { id: "b", type: "hologram", x: 0, y: 0, width: 10, height: 10 },
      ],
      edges: [{ id: "e", fromNode: "a", toNode: "nowhere" }],
    }),
  );
  assert.equal(odd.ok, true);
  if (!odd.ok) throw new Error("unreachable");
  const { elements, droppedNodes, droppedEdges } = jsonCanvasToElements(odd.canvas);
  assert.equal(droppedNodes, 1);
  assert.equal(droppedEdges, 1);
  // The rest of the canvas still comes in.
  assert.equal(elements.find((element) => element.id === "a")?.type, "rectangle");
  assert.equal(elements.some((element) => element.id === "e"), false);
});

test("a link that is not an address is dropped, so no board carries a javascript: or data: link", () => {
  const odd = parseJsonCanvas(
    JSON.stringify({
      nodes: [
        { id: "a", type: "link", url: "javascript:alert(1)", x: 0, y: 0, width: 10, height: 10 },
        { id: "b", type: "link", url: "data:text/html,<script>", x: 0, y: 0, width: 10, height: 10 },
        { id: "c", type: "link", url: "https://example.com/", x: 0, y: 0, width: 10, height: 10 },
      ],
    }),
  );
  assert.equal(odd.ok, true);
  if (!odd.ok) throw new Error("unreachable");
  const { elements, droppedNodes } = jsonCanvasToElements(odd.canvas);
  assert.equal(droppedNodes, 2);
  assert.equal(elements.length, 2);
  const texts = elements.map((element) => element.text ?? "").join(" ");
  assert.equal(texts.includes("javascript:"), false);
  assert.equal(texts.includes("data:"), false);
});

test("the export counts what the canvas format cannot carry", () => {
  const { canvas: withStroke, skipped } = exportJsonCanvas([
    { id: "a", type: "freedraw", x: 0, y: 0, width: 1, height: 1, isDeleted: false },
    { id: "b", type: "image", x: 0, y: 0, width: 1, height: 1, isDeleted: false },
    { id: "c", type: "text", x: 0, y: 0, width: 1, height: 1, text: "kept", isDeleted: false },
  ]);
  assert.equal(skipped, 2);
  assert.equal(withStroke.nodes.length, 1);
});

test("a deleted element is not part of the board a reader sees", () => {
  const { canvas: kept, skipped } = exportJsonCanvas([
    { id: "a", type: "text", x: 0, y: 0, width: 1, height: 1, text: "gone", isDeleted: true },
    { id: "b", type: "text", x: 0, y: 0, width: 1, height: 1, text: "here", isDeleted: false },
  ]);
  assert.equal(skipped, 0);
  assert.deepEqual(kept.nodes.map((node) => node.id), ["b"]);
});

test("readScene reads the elements of a board", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const client = createWhiteboardClient(async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ scene: { type: "osidraw", version: 1, elements: [{ id: "a" }] } }), { status: 200 });
  });
  const elements = await client.readScene("abc123");
  assert.deepEqual(elements, [{ id: "a" }]);
  assert.match(seen[0].url, /\/v1\/boards\/abc123$/);
  assert.equal(seen[0].init?.method ?? "GET", "GET");
});

test("readScene refuses a body that holds no elements", async () => {
  const client = createWhiteboardClient(async () => new Response(JSON.stringify({ scene: {} }), { status: 200 }));
  await assert.rejects(
    client.readScene("abc123"),
    (error: WhiteboardApiError) => error.code === "bad_response" && error.status === 0,
  );
});

test("readScene does not fetch a slug that is not a board", async () => {
  let calls = 0;
  const client = createWhiteboardClient(async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  });
  await assert.rejects(
    client.readScene("Not A Slug"),
    (error: WhiteboardApiError) => error.code === "bad_slug",
  );
  assert.equal(calls, 0);
});

test("the import refuses a canvas it cannot read and never reaches the service", async () => {
  let calls = 0;
  const client = {
    createBoard: async () => {
      calls += 1;
      return { slug: "abc123" };
    },
    importScene: async (slug: string) => ({ slug, elementCount: 0 }),
    readScene: async () => [],
  };
  const result = await importJsonCanvas({ content: "not a canvas", title: "Plan", client });
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});

test("the import writes the scene into a board of its own and says what came in", async () => {
  const sent: unknown[][] = [];
  const client = {
    createBoard: async (title: string) => ({ slug: "abc123" }),
    importScene: async (slug: string, elements: readonly unknown[]) => {
      sent.push([...elements]);
      return { slug, elementCount: elements.length };
    },
    readScene: async () => [],
  };
  const result = await importJsonCanvas({ content: sample, title: "sample", client });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.slug, "abc123");
  assert.equal(result.title, "sample");
  assert.equal(result.nodes, 5);
  assert.equal(result.edges, 3);
  assert.equal(result.droppedNodes, 0);
  assert.equal(result.droppedEdges, 0);
  assert.equal(sent[0].length, 13);
});

test("a random canvas never throws, never exceeds a cap and never carries a script", () => {
  // A seeded generator, so a failure is reproducible: the shape of a canvas is
  // arbitrary, and the reader has to survive all of it.
  let state = 20261022;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  for (let round = 0; round < 200; round += 1) {
    const nodes = new Array(1 + Math.floor(random() * 8)).fill(0).map((_, index) => ({
      id: `n${index}`,
      type: ["text", "link", "file", "group", "hologram"][Math.floor(random() * 5)],
      text: "a note",
      url: ["https://example.com/", "javascript:alert(1)", "data:text/html,<script>"][Math.floor(random() * 3)],
      file: "notes/a.md",
      x: Math.floor(random() * 2000) - 1000,
      y: Math.floor(random() * 2000) - 1000,
      width: 1 + Math.floor(random() * 500),
      height: 1 + Math.floor(random() * 500),
      color: ["1", "#3366ff", "chartreuse", undefined][Math.floor(random() * 4)],
    }));
    const edges = new Array(Math.floor(random() * 4)).fill(0).map((_, index) => ({
      id: `e${index}`,
      fromNode: nodes[Math.floor(random() * nodes.length)].id,
      toNode: nodes[Math.floor(random() * nodes.length)].id,
    }));
    const parsed = parseJsonCanvas(JSON.stringify({ nodes, edges }));
    if (!parsed.ok) continue;
    const { elements, droppedNodes, droppedEdges } = jsonCanvasToElements(parsed.canvas);
    assert.ok(elements.length <= MAX_IMPORT_ELEMENTS);
    assert.ok(droppedNodes >= 0 && droppedEdges >= 0);
    const texts = elements.map((element) => element.text ?? "").join(" ");
    assert.equal(texts.includes("javascript:"), false);
    assert.equal(texts.includes("data:"), false);
    assert.equal(elements.some((element) => element.embedUrl !== undefined), false);
    assert.equal(elements.some((element) => element.isDeleted), false);
  }
});

test("the import says that a board is reachable by anyone with its link", () => {
  const markup = renderToStaticMarkup(React.createElement(JsonCanvasImport, { onImported: () => {} }));
  assert.ok(markup.includes(JSON_CANVAS_VISIBILITY_NOTICE), "the import says who can open the board");
  assert.match(markup, /accept="\.canvas, application\/json"/);
  assert.match(markup, /Import JSON Canvas/);
});

test("the export says that a board is reachable by anyone with its link", () => {
  const markup = renderToStaticMarkup(React.createElement(WhiteboardBoardMenu, { onExport: () => {} }));
  assert.match(markup, /Export as JSON Canvas/);
  assert.ok(markup.includes(JSON_CANVAS_VISIBILITY_NOTICE), "the export says who can open the board");
});

test("the file the import reads is capped at 5 MB", () => {
  assert.equal(MAX_CANVAS_FILE_BYTES, 5 * 1024 * 1024);
});

// --- review conditions (PR #88) ---

const box = { x: 0, y: 0, width: 10, height: 10 };
const textNode = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: "text", text: "t", ...box, ...extra });
const doc = (nodes: unknown[], edges: unknown[] = []) => JSON.stringify({ nodes, edges });
const reasonOf = (text: string) => {
  const result = parseJsonCanvas(text);
  return result.ok ? "" : result.reason;
};

test("C1: fractional coordinates export as integers and the export re-imports", () => {
  const { canvas: out } = exportJsonCanvas([
    { id: "a", type: "rectangle", x: 10.6, y: -3.4, width: 99.5, height: 20.2, text: "hi", isDeleted: false },
  ]);
  assert.equal(out.nodes[0].x, 11);
  assert.equal(out.nodes[0].y, -3);
  assert.equal(out.nodes[0].width, 100);
  assert.equal(parseJsonCanvas(JSON.stringify(out)).ok, true);
  const floats = parseJsonCanvas(doc([textNode("f", { x: 1.5, width: 0.6 })]));
  assert.equal(floats.ok, true);
  if (floats.ok) assert.deepEqual([floats.canvas.nodes[0].x, floats.canvas.nodes[0].width], [2, 1]);
});

test("C2: two edges sharing an id, or an edge id equal to a node id, are refused", () => {
  const edge = (id: string) => ({ id, fromNode: "a", toNode: "b" });
  const nodes = [textNode("a"), textNode("b")];
  assert.match(reasonOf(doc(nodes, [edge("e"), edge("e")])), /share the id/);
  assert.match(reasonOf(doc(nodes, [edge("a")])), /share the id/);
});

test("C3: edge.label, node.type, node.backgroundStyle, edge.fromNode and edge.toNode are capped", () => {
  const nodes = [textNode("a"), textNode("b")];
  const edge = (extra: Record<string, unknown>) => doc(nodes, [{ id: "e", fromNode: "a", toNode: "b", ...extra }]);
  assert.equal(parseJsonCanvas(edge({ label: "x".repeat(10_001) })).ok, false);
  assert.equal(parseJsonCanvas(edge({ fromNode: "x".repeat(1_025) })).ok, false);
  assert.equal(parseJsonCanvas(edge({ toNode: "x".repeat(1_025) })).ok, false);
  assert.equal(parseJsonCanvas(doc([textNode("a", { type: "x".repeat(65) })])).ok, false);
  assert.equal(parseJsonCanvas(doc([textNode("a", { backgroundStyle: "x".repeat(65) })])).ok, false);
  assert.equal(parseJsonCanvas(edge({ label: "x".repeat(10_000) })).ok, true);
});

test("C3b: a node or edge array over the element cap is refused by the schema", () => {
  const nodes = Array.from({ length: MAX_IMPORT_ELEMENTS + 1 }, (_, index) => textNode(`n${index}`));
  assert.equal(parseJsonCanvas(doc(nodes)).ok, false);
});

test("C4: importJsonCanvas refuses content one byte over the file cap, before parsing", async () => {
  const client = createWhiteboardClient(async () => {
    throw new Error("the client must not be reached");
  });
  const over = "a".repeat(MAX_CANVAS_FILE_BYTES + 1);
  const result = await importJsonCanvas({ content: over, title: "t", client });
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.message, /at most/);
  // Multi-byte characters count by bytes, not by length.
  const wide = await importJsonCanvas({ content: "é".repeat(MAX_CANVAS_FILE_BYTES / 2 + 1), title: "t", client });
  assert.match(wide.ok ? "" : wide.message, /at most/);
});

test("C5: every exported node and edge passes the import schema; offenders are skipped and counted", () => {
  const { canvas: out, skipped } = exportJsonCanvas([
    { id: "ok", type: "rectangle", ...box, text: "fine", isDeleted: false },
    { id: "far", type: "rectangle", x: 5e6, y: 0, width: 10, height: 10, isDeleted: false },
    { id: "flat", type: "rectangle", x: 0, y: 0, width: 0, height: 10, isDeleted: false },
    { id: "i".repeat(1_025), type: "rectangle", ...box, isDeleted: false },
    { id: "big", type: "text", ...box, text: "x".repeat(10_001), isDeleted: false },
    { id: "arrow", type: "arrow", startBinding: "far", endBinding: "ok", x: 0, y: 0, points: [[0, 0], [5, 5]], isDeleted: false },
  ]);
  assert.deepEqual(out.nodes.map((node) => node.id), ["ok"]);
  assert.equal(out.edges.length, 0);
  assert.equal(skipped, 5);
  assert.equal(parseJsonCanvas(JSON.stringify(out)).ok, true);
});

test("C6: toEnd is none unless the arrow has an arrowhead", () => {
  const shapes = [
    { id: "a", type: "rectangle", ...box, text: "a", isDeleted: false },
    { id: "b", type: "rectangle", x: 100, y: 0, width: 10, height: 10, text: "b", isDeleted: false },
  ];
  const arrow = (id: string, extra: Record<string, unknown>) => ({
    id, type: "arrow", startBinding: "a", endBinding: "b", x: 10, y: 5, points: [[0, 0], [90, 0]], isDeleted: false, ...extra,
  });
  const { canvas: out } = exportJsonCanvas([...shapes, arrow("none", {}), arrow("head", { endArrowhead: "arrow" })]);
  assert.equal(out.edges.find((edge) => edge.id === "none")?.toEnd, "none");
  assert.equal(out.edges.find((edge) => edge.id === "head")?.toEnd, "arrow");
});

test("C7: IdMinter never returns an id twice, fallback path included", () => {
  const minter = new IdMinter() as unknown as { take(base: string): string };
  const ids = Array.from({ length: 2_500 }, () => minter.take("same"));
  assert.equal(new Set(ids).size, ids.length);
});
