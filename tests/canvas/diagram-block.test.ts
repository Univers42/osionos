/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagram-block.test.ts                                 +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The diagram block (devil C108, C109, C110): a stored SPEC, drawn live.
//
// The block is where the trust boundary of a diagram becomes VISIBLE:
//
//   1. the block stores a SPEC, never the rendered output — so a diagram is
//      compiled again, from the data of the moment, and a renamed page
//      redraws;
//   2. the pages a page tree is drawn from are the ones the VIEWER may read:
//      an archived page is not in the tree, and a page that is not in the
//      list is not reachable — not even as an unnamed node;
//   3. on a PUBLIC page the block draws nothing and reads no other page: it
//      shows a text placeholder;
//   4. the markdown export carries the SANITIZED source, so a directive never
//      leaves the page through an export.

import assert from "node:assert/strict";
import test from "node:test";

import { parseMarkdownToBlocks } from "../../packages/markdown-engine/markdown/shortcuts.ts";
import { createDiagramBlock } from "@/entities/block/model/diagramBlocks";
import { compileGraph, compileSchema } from "@/features/diagram/model/compile";
import {
  pipelineInput,
  schemaInput,
  type DatabaseLike,
  type PageLike,
} from "@/features/diagram/model/databaseInput";
import { diagramBlockToMarkdown } from "@/features/diagram/model/diagramMarkdown";
import {
  copyMermaidText,
  downloadDiagramSvg,
  svgFileBlob,
} from "@/features/diagram/model/diagramExport";
import { diagramRenderMode } from "@/features/diagram/model/diagramRenderMode";
import {
  graphKinds,
  MAX_NEIGHBORS,
  neighbourhood,
  pageGraph,
} from "@/features/diagram/model/graphInput";
import {
  graphSource,
  NOT_IN_GRAPH_MESSAGE,
  SIGN_IN_MESSAGE,
} from "@/features/diagram/model/graphSource";
import { hierarchyInput, type HierarchyPage } from "@/features/diagram/model/hierarchyInput";
import { mermaidFromAnswer } from "@/features/diagram/model/mermaidAnswer";
import { parseDiagramSpec } from "@/features/diagram/model/diagramSpec";
import { escapeLabel, irToMermaid } from "@/features/diagram/model/toMermaid";
import {
  blockToMarkdown,
  serializeBlocksToMarkdown,
} from "@/services/page-actions/pageMarkdownSerialize";
import type { BridgeGraph } from "@/features/graph-studio/model/toIngestDoc";

const UUID_ROOT = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const UUID_CHILD = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * A small tree:
 *
 *   root
 *   ├── a          (a child of root)
 *   │   └── b      (a child of a)
 *   │       └── c  (a child of b)
 *   ├── archived   (a child of root, ARCHIVED)
 *   └── (nothing)  — orphan hangs from a parent that is NOT in the list
 */
const PAGES: HierarchyPage[] = [
  { id: "root", title: "Root", parentId: null },
  { id: "a", title: "A", parentId: "root" },
  { id: "b", title: "B", parentId: "a" },
  { id: "c", title: "C", parentId: "b" },
  { id: "archived", title: "Old", parentId: "root", archived: true },
  { id: "orphan", title: "Orphan", parentId: "ghost" },
];

/* -------------------------------------------------------------------------- */
/* The block                                                                   */
/* -------------------------------------------------------------------------- */

test("a fresh diagram block carries a spec that parses", () => {
  const block = createDiagramBlock();
  assert.equal(block.type, "diagram");
  assert.equal(block.content, "");
  const parsed = parseDiagramSpec(block.diagramSpec);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) return;
  assert.equal(parsed.spec.kind, "mermaid");
});

test("a fresh diagram block can be created with a spec of its own", () => {
  const block = createDiagramBlock({ kind: "hierarchy", rootPageId: UUID_ROOT, depth: 2 });
  const parsed = parseDiagramSpec(block.diagramSpec);
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
});

/* -------------------------------------------------------------------------- */
/* The page tree                                                               */
/* -------------------------------------------------------------------------- */

test("the page tree stops at the depth it is given", () => {
  const one = hierarchyInput(PAGES, "root", 1);
  assert.deepEqual(one.root, { id: "root", title: "Root" });
  assert.deepEqual(one.children.map((child) => child.id), ["a"]);

  const two = hierarchyInput(PAGES, "root", 2);
  assert.deepEqual(two.children.map((child) => child.id), ["a", "b"]);

  const three = hierarchyInput(PAGES, "root", 3);
  assert.deepEqual(three.children.map((child) => child.id), ["a", "b", "c"]);
});

test("an archived page is not in the tree", () => {
  const input = hierarchyInput(PAGES, "root", 4);
  assert.ok(
    !input.children.some((child) => child.id === "archived"),
    "an archived page reached the tree",
  );
});

test("a child whose parent is absent is not reachable", () => {
  const input = hierarchyInput(PAGES, "root", 4);
  assert.ok(
    !input.children.some((child) => child.id === "orphan"),
    "a page whose parent is absent reached the tree",
  );
});

test("a root that is not in the list gives an empty input", () => {
  const input = hierarchyInput(PAGES, "ghost", 3);
  assert.equal(input.root, null);
  assert.deepEqual(input.children, []);
});

test("an archived root gives an empty input", () => {
  const input = hierarchyInput(PAGES, "archived", 3);
  assert.equal(input.root, null);
  assert.deepEqual(input.children, []);
});

/* -------------------------------------------------------------------------- */
/* The databases the client holds                                              */
/* -------------------------------------------------------------------------- */

/**
 * Two databases, shaped like the seed: tasks with a relation to projects, and
 * a status column. The ids are the app's own — `db-tasks`, `db-projects` —
 * and they are NOT uuids.
 */
const TASKS: DatabaseLike = {
  id: "db-tasks",
  name: "Tasks & Projects",
  titlePropertyId: "prop-title",
  properties: {
    "prop-title": { id: "prop-title", name: "Task Name", type: "title" },
    "prop-status": {
      id: "prop-status",
      name: "Status",
      type: "status",
      options: [
        { id: "opt-todo", value: "To Do" },
        { id: "opt-done", value: "Done" },
      ],
    },
    "prop-project": {
      id: "prop-project",
      name: "Project",
      type: "relation",
      relationConfig: { databaseId: "db-projects" },
    },
  },
};

const PROJECTS: DatabaseLike = {
  id: "db-projects",
  name: "Projects & Sprints",
  titlePropertyId: "proj-title",
  properties: {
    "proj-title": { id: "proj-title", name: "Project Name", type: "title" },
  },
};

const DATABASES: Record<string, DatabaseLike> = {
  "db-tasks": TASKS,
  "db-projects": PROJECTS,
};

/**
 * The records of those databases: the pages of the client. The status of a
 * page is the OPTION ID (`opt-done`), not its name.
 */
const RECORDS: Record<string, PageLike> = {
  t1: {
    id: "t1",
    databaseId: "db-tasks",
    properties: { "prop-title": "Design Database Schema", "prop-status": "opt-done" },
  },
  t2: {
    id: "t2",
    databaseId: "db-tasks",
    properties: { "prop-title": "Fix Drag-and-Drop Bug" },
  },
  c1: {
    id: "c1",
    databaseId: "db-crm",
    properties: { "prop-title": "ACME" },
  },
};

test("a database id is a lookup key, not a uuid: the ids the client holds are taken", () => {
  for (const databaseId of ["db-tasks", "db-inline-1a2b3c4d", UUID_ROOT]) {
    const schema = parseDiagramSpec({ kind: "schema", databaseIds: [databaseId] });
    assert.equal(schema.ok, true, databaseId);
    const pipeline = parseDiagramSpec({
      kind: "pipeline",
      databaseId,
      statusPropertyId: "prop-status",
    });
    assert.equal(pipeline.ok, true, databaseId);
  }
  for (const databaseId of ["", "a b", "<x>", "d".repeat(121)]) {
    const schema = parseDiagramSpec({ kind: "schema", databaseIds: [databaseId] });
    assert.equal(schema.ok, false, `the schema took ${JSON.stringify(databaseId)}`);
    const pipeline = parseDiagramSpec({
      kind: "pipeline",
      databaseId,
      statusPropertyId: "prop-status",
    });
    assert.equal(pipeline.ok, false, `the pipeline took ${JSON.stringify(databaseId)}`);
  }
});

test("a database the client does not hold is skipped, never drawn as an unnamed node", () => {
  const input = schemaInput(DATABASES, ["db-tasks", "db-ghost"]);
  assert.deepEqual(
    input.map((database) => database.id),
    ["db-tasks"],
  );
});

test("a relation names the database it points at", () => {
  const input = schemaInput(DATABASES, ["db-tasks"]);
  const relation = input[0]?.properties.find((property) => property.id === "prop-project");
  assert.equal(relation?.relationTo, "db-projects");
});

test("the order of the ids does not matter: the compiler sorts", () => {
  const one = irToMermaid(compileSchema(schemaInput(DATABASES, ["db-tasks", "db-projects"])));
  const two = irToMermaid(compileSchema(schemaInput(DATABASES, ["db-projects", "db-tasks"])));
  assert.equal(one, two);
});

test("golden: the schema of two databases, drawn from the client's own", () => {
  const ir = compileSchema(schemaInput(DATABASES, ["db-tasks", "db-projects"]));
  assert.equal(
    irToMermaid(ir),
    [
      "flowchart LR",
      'n0["Projects & Sprints: Project Name (title)"]',
      'n1["Tasks & Projects: Project (relation), Status (status), Task Name (title)"]',
      'n1 -- "Project" --> n0',
    ].join("\n"),
  );
});

test("a pipeline draws the rows of its own database only", () => {
  const input = pipelineInput(DATABASES, RECORDS, "db-tasks", "prop-status");
  assert.ok(input);
  assert.deepEqual(
    input.rows.map((row) => row.id),
    ["t1", "t2"],
  );
  assert.deepEqual(input.options, [
    { id: "opt-todo", name: "To Do" },
    { id: "opt-done", name: "Done" },
  ]);
});

test("a row without a status has no status", () => {
  const input = pipelineInput(DATABASES, RECORDS, "db-tasks", "prop-status");
  assert.ok(input);
  const row = input.rows.find((entry) => entry.id === "t2");
  assert.equal(row?.statusId, "");
  assert.equal(row?.title, "Fix Drag-and-Drop Bug");
});

test("a column that is not a status gives no pipeline", () => {
  assert.equal(pipelineInput(DATABASES, RECORDS, "db-tasks", "prop-title"), null);
});

test("a database the client does not hold gives no pipeline", () => {
  assert.equal(pipelineInput(DATABASES, RECORDS, "db-ghost", "prop-status"), null);
});

/* -------------------------------------------------------------------------- */
/* The public page (C110)                                                       */
/* -------------------------------------------------------------------------- */

test("a public page shows a placeholder, never a diagram", () => {
  const spec = { kind: "mermaid", source: "flowchart LR\n  A --> B" };
  assert.equal(diagramRenderMode({ isPublic: true, spec }), "placeholder");
  assert.equal(diagramRenderMode({ isPublic: false, spec }), "render");
});

test("a public page shows the placeholder for a schema and for a pipeline too", () => {
  const schema = { kind: "schema", databaseIds: ["db-tasks"] };
  assert.equal(diagramRenderMode({ isPublic: true, spec: schema }), "placeholder");
  assert.equal(diagramRenderMode({ isPublic: false, spec: schema }), "render");
  const pipeline = { kind: "pipeline", databaseId: "db-tasks", statusPropertyId: "prop-status" };
  assert.equal(diagramRenderMode({ isPublic: true, spec: pipeline }), "placeholder");
  assert.equal(diagramRenderMode({ isPublic: false, spec: pipeline }), "render");
});

test("a public page shows the placeholder even for a broken spec", () => {
  assert.equal(diagramRenderMode({ isPublic: true, spec: { kind: "mermaid" } }), "placeholder");
});

test("a spec that does not parse is an error, not a diagram", () => {
  assert.equal(diagramRenderMode({ isPublic: false, spec: { kind: "mermaid" } }), "error");
  assert.equal(diagramRenderMode({ isPublic: false, spec: { kind: "sql", query: "select 1" } }), "error");
  assert.equal(diagramRenderMode({ isPublic: false, spec: undefined }), "error");
});

/* -------------------------------------------------------------------------- */
/* The markdown export                                                         */
/* -------------------------------------------------------------------------- */

test("a mermaid diagram exports as a sanitized mermaid fence", () => {
  const markdown = blockToMarkdown({
    id: "b1",
    type: "diagram",
    content: "",
    diagramSpec: {
      kind: "mermaid",
      source: '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n  A --> B',
    },
  });
  assert.ok(markdown.startsWith("```mermaid"), markdown);
  assert.ok(markdown.includes("flowchart LR"), markdown);
  assert.ok(!markdown.includes("%%{init"), "a directive left the page through the export");
});

test("a page tree exports as its spec, never as a picture of the data", () => {
  const markdown = blockToMarkdown({
    id: "b2",
    type: "diagram",
    content: "",
    diagramSpec: { kind: "hierarchy", rootPageId: UUID_ROOT, depth: 2 },
  });
  assert.ok(markdown.startsWith("<!-- osionos:diagram "), markdown);
  assert.ok(markdown.includes(`"kind":"hierarchy"`), markdown);
  assert.ok(markdown.includes(UUID_ROOT), markdown);
  assert.ok(markdown.includes("-->"), markdown);
});

test("a diagram exports to exactly one markdown block (the overlay is aligned by position)", () => {
  const page = {
    _id: "p",
    workspaceId: "w",
    title: "T",
    content: [
      { id: "b1", type: "paragraph", content: "before" },
      {
        id: "b2",
        type: "diagram",
        content: "",
        diagramSpec: { kind: "hierarchy", rootPageId: UUID_ROOT, depth: 2 },
      },
      { id: "b3", type: "paragraph", content: "after" },
    ],
  };
  const blocks = parseMarkdownToBlocks(serializeBlocksToMarkdown(page.content));
  assert.equal(blocks.length, page.content.length, "the body keeps one block per block");
  assert.equal(blocks[0]?.content, "before");
  assert.equal(blocks[2]?.content, "after");
});

test("the diagram export of a broken spec keeps the spec it was given", () => {
  const markdown = diagramBlockToMarkdown({ kind: "mermaid" });
  assert.ok(markdown.startsWith("<!-- osionos:diagram "), markdown);
  assert.ok(markdown.includes('"kind":"mermaid"'), markdown);
});

test("a title cannot close the export's comment and leave its tail in the markdown", () => {
  const title = "--> <img src=x onerror=alert(1)> <!--";
  const markdown = diagramBlockToMarkdown({ kind: "hierarchy", rootPageId: UUID_CHILD, depth: 1, title });
  const comment = markdown.split("\n")[0];
  assert.equal(markdown.split("-->").length, 2, "the comment closes exactly once");
  assert.ok(comment.endsWith(" -->"), comment);
  assert.ok(!markdown.includes("<img"), markdown);
  const json = comment.slice("<!-- osionos:diagram ".length, -" -->".length);
  assert.equal(JSON.parse(json).title, title, "the spec reads back the same");
});

test("a mermaid source that carries a fence cannot break out of its own", () => {
  const markdown = diagramBlockToMarkdown({
    kind: "mermaid",
    source: "flowchart LR\n  A[\"```\"] --> B",
  });
  const fence = markdown.split("\n")[0].replace(/mermaid$/, "");
  assert.ok(fence.length > 3, "the fence did not grow");
  assert.ok(markdown.split("\n").at(-1) === fence, markdown);
});

/* -------------------------------------------------------------------------- */
/* The ids are real ids                                                        */
/* -------------------------------------------------------------------------- */

test("a page tree works on a page that is not synced yet, and nothing else passes for an id", () => {
  const local = parseDiagramSpec({ kind: "hierarchy", rootPageId: "local-page-3-mvj3n3mc", depth: 2 });
  assert.equal(local.ok, true, local.ok ? "" : local.error);
  for (const rootPageId of ["local-page-x-1", "local-page-3-mvj3n3mc\nclick", "page-3", "", "local-page-3-ABC"]) {
    assert.equal(parseDiagramSpec({ kind: "hierarchy", rootPageId, depth: 2 }).ok, false, rootPageId);
  }
});

test("a hierarchy spec names a page by its uuid", () => {
  const parsed = parseDiagramSpec({ kind: "hierarchy", rootPageId: UUID_CHILD, depth: 1 });
  assert.equal(parsed.ok, true, parsed.ok ? "" : parsed.error);
});

/* -------------------------------------------------------------------------- */
/* The links around a page (the graph kind)                                    */
/* -------------------------------------------------------------------------- */

/** The node id the bridge gives a page. */
const node = (pageId: string) => `osionos:osionos_pages:${pageId}`;

/** The pages of the fixture graph — uuids, because a spec names a page by one. */
const CENTRE = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";

/**
 * A small graph, shaped like the bridge's:
 *
 *   centre ──link────▶ a ──link────▶ b
 *      │      │          │
 *      │      └──link──▶ (absent) ──link──▶ d
 *      └─relation──▶ c
 *
 * "absent" is NOT a node of the graph: the edges that name it are dangling.
 * The centre points at it directly, so a walk that STEPS ON a missing node
 * would reach "d" in two hops — and the page beyond it must never be reached:
 * the walk never goes THROUGH a node the reader's graph does not hold
 * (devil C100). The cut is made BEFORE the walk, never after it.
 */
const GRAPH: BridgeGraph = {
  nodes: [
    { id: node(CENTRE), data: { title: "Centre" } },
    { id: node(A), data: { title: "A" } },
    { id: node(B), data: { title: "B" } },
    { id: node(C), data: { title: "C" } },
    { id: node(D), data: { title: "D" } },
  ],
  edges: [
    { from: node(CENTRE), to: node(A), type: "link" },
    { from: node(CENTRE), to: node(C), type: "relation" },
    { from: node(CENTRE), to: node("absent"), type: "link" },
    { from: node(A), to: node(B), type: "link" },
    { from: node(A), to: node("absent"), type: "link" },
    { from: node("absent"), to: node(D), type: "link" },
  ],
};

test("the neighbourhood of a page is its links, one hop deep", () => {
  const hood = neighbourhood(pageGraph(GRAPH), CENTRE, 1);
  assert.deepEqual(hood.center, { id: CENTRE, title: "Centre" });
  assert.deepEqual(
    hood.neighbors.map((neighbor) => neighbor.pageId),
    [A, C],
  );
  assert.deepEqual(
    hood.neighbors.map((neighbor) => neighbor.kind),
    ["link", "relation"],
  );
  assert.equal(hood.truncated, false);
});

test("two hops reach the pages of the neighbours, and say through which", () => {
  const hood = neighbourhood(pageGraph(GRAPH), CENTRE, 2);
  // The walk is level by level: the first hop first, then the second.
  assert.deepEqual(
    hood.neighbors.map((neighbor) => neighbor.pageId),
    [A, C, B],
  );
  const second = hood.neighbors.find((neighbor) => neighbor.pageId === B);
  assert.equal(second?.depth, 2);
  assert.equal(second?.via, "A", "the page it was reached through");
  const first = hood.neighbors.find((neighbor) => neighbor.pageId === A);
  assert.equal(first?.via, undefined, "a page of the first hop is reached directly");
});

test("the walk never goes through a page the graph does not hold", () => {
  const hood = neighbourhood(pageGraph(GRAPH), CENTRE, 2);
  // The page beyond the missing node is never reached: the walk is cut BEFORE
  // it starts, so it cannot step on a node the reader's graph does not hold.
  assert.ok(
    !hood.neighbors.some((neighbor) => neighbor.pageId === D),
    "a page behind a missing node reached the neighbourhood",
  );
  // And the missing node itself is not a neighbour: it is not a page.
  assert.ok(
    !hood.neighbors.some((neighbor) => neighbor.pageId === "absent"),
    "a page the graph does not hold reached the neighbourhood",
  );
});

test("the neighbourhood holds forty neighbours at most, and says the rest are missing", () => {
  const nodes: BridgeGraph["nodes"] = [{ id: node(CENTRE), data: { title: "Centre" } }];
  const edges: NonNullable<BridgeGraph["edges"]> = [];
  for (let index = 0; index < 50; index += 1) {
    nodes.push({ id: node(`n${index}`), data: { title: `N${index}` } });
    edges.push({ from: node(CENTRE), to: node(`n${index}`), type: "link" });
  }
  const hood = neighbourhood(pageGraph({ nodes, edges }), CENTRE, 1);
  assert.equal(hood.neighbors.length, MAX_NEIGHBORS);
  assert.equal(hood.truncated, true);
  assert.equal(hood.dropped, 50 - MAX_NEIGHBORS);
});

test("the kinds filter the walk", () => {
  const pages = pageGraph(GRAPH);
  assert.deepEqual(
    neighbourhood(pages, CENTRE, 1, ["link"]).neighbors.map((neighbor) => neighbor.pageId),
    [A],
  );
  assert.deepEqual(
    neighbourhood(pages, CENTRE, 1, ["relation"]).neighbors.map((neighbor) => neighbor.pageId),
    [C],
  );
  // No filter is no exclusion: every kind is walked.
  assert.deepEqual(
    neighbourhood(pages, CENTRE, 1, []).neighbors.map((neighbor) => neighbor.pageId),
    [A, C],
  );
});

test("the toggles offer the kinds the graph holds", () => {
  assert.deepEqual(graphKinds(pageGraph(GRAPH)), ["link", "relation"]);
});

test("golden: the neighbourhood of a page, drawn from the reader's own graph", () => {
  const hood = neighbourhood(pageGraph(GRAPH), CENTRE, 1);
  assert.ok(hood.center);
  assert.equal(
    irToMermaid(compileGraph(hood.center, hood.neighbors)),
    [
      "flowchart LR",
      'n0["Centre"]',
      'n1["A"]',
      'n2["C"]',
      'n0 -- "link" --> n1',
      'n0 -- "relation" --> n2',
    ].join("\n"),
  );
});

test("golden: two hops, and the page each one was reached through", () => {
  const hood = neighbourhood(pageGraph(GRAPH), CENTRE, 2);
  assert.ok(hood.center);
  assert.equal(
    irToMermaid(compileGraph(hood.center, hood.neighbors)),
    [
      "flowchart LR",
      'n0["Centre"]',
      'n1["A"]',
      'n2["B"]',
      'n3["C"]',
      'n0 -- "link" --> n1',
      'n0 -- "link via A" --> n2',
      'n0 -- "relation" --> n3',
    ].join("\n"),
  );
});

/* -------------------------------------------------------------------------- */
/* The refusals of the graph kind                                               */
/* -------------------------------------------------------------------------- */

/** A spec that names the centre of the fixture graph. */
const GRAPH_SPEC = { kind: "graph", pageId: CENTRE, depth: 1, kinds: [] };

test("a published page shows the placeholder, like the database kinds", () => {
  assert.equal(diagramRenderMode({ isPublic: true, spec: GRAPH_SPEC }), "placeholder");
  assert.equal(diagramRenderMode({ isPublic: false, spec: GRAPH_SPEC }), "render");
});

test("a published page asks for nothing at all", async () => {
  let calls = 0;
  const output = await graphSource(GRAPH_SPEC, {
    isPublic: true,
    jwt: "a-token",
    fetchGraph: async () => {
      calls += 1;
      return GRAPH;
    },
  });
  assert.equal(calls, 0, "a published page asked the bridge for its graph");
  assert.equal(output.source.source, null);
  assert.equal(output.source.error, null);
});

test("a reader with no session is told to sign in, and asks for nothing", async () => {
  let calls = 0;
  const output = await graphSource(GRAPH_SPEC, {
    isPublic: false,
    jwt: null,
    fetchGraph: async () => {
      calls += 1;
      return GRAPH;
    },
  });
  assert.equal(calls, 0, "an offline app asked the bridge for its graph");
  assert.equal(output.source.error, SIGN_IN_MESSAGE);
  assert.equal(SIGN_IN_MESSAGE, "Sign in to draw the links of this page");
});

test("a page that does not exist and a page the reader may not read are the same thing", async () => {
  // The page does not exist: the graph holds nothing.
  const missing = await graphSource(GRAPH_SPEC, {
    isPublic: false,
    jwt: "a-token",
    fetchGraph: async () => ({ nodes: [], edges: [] }),
  });
  // The page exists, but the reader may not read it: the bridge filtered it
  // out, so the graph holds the OTHER pages and not this one. The answer is
  // the same string, byte for byte (devil C101).
  const unreadable = await graphSource(GRAPH_SPEC, {
    isPublic: false,
    jwt: "a-token",
    fetchGraph: async () => ({
      nodes: (GRAPH.nodes ?? []).filter((node) => !node.id.endsWith(CENTRE)),
      edges: GRAPH.edges,
    }),
  });
  assert.equal(missing.source.error, NOT_IN_GRAPH_MESSAGE);
  assert.equal(unreadable.source.error, missing.source.error);
  assert.equal(NOT_IN_GRAPH_MESSAGE, "This page is not in your graph");
});

test("the graph kind draws the links of the page it names", async () => {
  const output = await graphSource(GRAPH_SPEC, {
    isPublic: false,
    jwt: "a-token",
    fetchGraph: async () => GRAPH,
  });
  assert.equal(output.source.error, null);
  assert.equal(
    output.source.source,
    [
      "flowchart LR",
      'n0["Centre"]',
      'n1["A"]',
      'n2["C"]',
      'n0 -- "link" --> n1',
      'n0 -- "relation" --> n2',
    ].join("\n"),
  );
  assert.deepEqual(output.kinds, ["link", "relation"]);
});

test("the cap of the neighbourhood says how many links the diagram holds less of", async () => {
  const nodes: BridgeGraph["nodes"] = [{ id: node(CENTRE), data: { title: "Centre" } }];
  const edges: NonNullable<BridgeGraph["edges"]> = [];
  for (let index = 0; index < 50; index += 1) {
    nodes.push({ id: node(`n${index}`), data: { title: `N${index}` } });
    edges.push({ from: node(CENTRE), to: node(`n${index}`), type: "link" });
  }
  const output = await graphSource(GRAPH_SPEC, {
    isPublic: false,
    jwt: "a-token",
    fetchGraph: async () => ({ nodes, edges }),
  });
  assert.equal(output.source.truncated, true);
  assert.equal(output.source.truncatedNote, "Showing 40 of 50 neighbours");
});

/* -------------------------------------------------------------------------- */
/* The export                                                                  */
/* -------------------------------------------------------------------------- */

/** An SVG element, as the browser serialises it: the label is TEXT. */
interface TestSvg {
  serialize(): string;
}

/** The text of an element, as the browser escapes it. */
function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The SVG of a drawn diagram, with the label as its text. */
function svgWithLabel(label: string): TestSvg {
  return {
    serialize: () => `<svg xmlns="http://www.w3.org/2000/svg"><text>${escapeXml(label)}</text></svg>`,
  };
}

/** The browser's serialiser, for the test. */
class TestSerializer {
  serializeToString(node: TestSvg): string {
    return node.serialize();
  }
}

// Node has no XMLSerializer: the browser's is what the export uses, and the
// test stands one in for the whole file.
(globalThis as unknown as { XMLSerializer: unknown }).XMLSerializer ??= TestSerializer;

test("the exported SVG is the serialised locked output, and a title stays text", async () => {
  const title = '<script>alert(1)</script> " onerror="alert(2)';
  const ir = compileGraph(
    { id: "centre", title },
    [{ pageId: "a", title: "A", kind: "link", depth: 1 }],
  );
  // The trust boundary: the label is escaped, so the title is never markup.
  const source = irToMermaid(ir);
  assert.ok(!source.includes("<script"), source);
  const label = escapeLabel(title);
  assert.ok(!label.includes("<script"), label);

  const svg = svgWithLabel(label);
  const blob = svgFileBlob(svg as unknown as SVGElement);
  assert.equal(blob.type, "image/svg+xml");
  const text = await blob.text();
  // The blob IS the serialised output: nothing is drawn again.
  assert.equal(text, svg.serialize());
  // The title is TEXT in the file: no tag of the SVG carries it.
  const tags = text.match(/<[^>]*>/g) ?? [];
  assert.ok(tags.every((tag) => !/script|onerror/i.test(tag)), tags.join(" "));
});

test("a published page never exports a diagram", async () => {
  let written = "";
  const copied = await copyMermaidText({
    isPublic: true,
    source: "flowchart LR\n  A --> B",
    clipboard: {
      writeText: async (text: string) => {
        written = text;
      },
    },
  });
  assert.equal(copied, "refused");
  assert.equal(written, "", "a published page put a diagram on the clipboard");

  const opened: string[] = [];
  const revoked: string[] = [];
  const downloaded = downloadDiagramSvg({
    isPublic: true,
    svg: svgWithLabel("A") as unknown as SVGElement,
    fileName: "diagram.svg",
    createUrl: () => "blob:one",
    revokeUrl: (url: string) => {
      revoked.push(url);
    },
    open: (url: string) => {
      opened.push(url);
    },
  });
  assert.equal(downloaded, "refused");
  assert.deepEqual(opened, [], "a published page downloaded a diagram");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(revoked, [], "a published page made an object URL");
});

test("the export of a diagram of the reader's own page works", async () => {
  let written = "";
  const copied = await copyMermaidText({
    isPublic: false,
    source: "flowchart LR\n  A --> B",
    clipboard: {
      writeText: async (text: string) => {
        written = text;
      },
    },
  });
  assert.equal(copied, "copied");
  assert.equal(written, "flowchart LR\n  A --> B");

  const opened: string[] = [];
  const revoked: string[] = [];
  const downloaded = downloadDiagramSvg({
    isPublic: false,
    svg: svgWithLabel("A") as unknown as SVGElement,
    fileName: "diagram.svg",
    createUrl: () => "blob:one",
    revokeUrl: (url: string) => {
      revoked.push(url);
    },
    open: (url: string, fileName: string) => {
      opened.push(`${url}|${fileName}`);
    },
  });
  assert.equal(downloaded, "downloaded");
  assert.deepEqual(opened, ["blob:one|diagram.svg"]);
  // The revoke waits a tick: a revoke that lands before the browser read the
  // Blob cancels the download (Firefox).
  assert.deepEqual(revoked, [], "the object URL was revoked before the browser read the Blob");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(revoked, ["blob:one"], "the object URL outlived the download");
});

/* -------------------------------------------------------------------------- */
/* The answer of the AI                                                         */
/* -------------------------------------------------------------------------- */

test("the mermaid of an answer is its fenced block", () => {
  const answer = "Here is the diagram:\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nEnjoy.";
  assert.equal(mermaidFromAnswer(answer), "flowchart LR\n  A --> B");
  assert.equal(mermaidFromAnswer("flowchart LR\n  A --> B"), "flowchart LR\n  A --> B");
  assert.equal(mermaidFromAnswer("Just a sentence."), null);
  assert.equal(mermaidFromAnswer(""), null);
});

test("an answer too long for the spec is refused", () => {
  const answer = `\`\`\`mermaid\nflowchart LR\n${"  A --> B\n".repeat(3000)}\`\`\``;
  assert.equal(mermaidFromAnswer(answer), null);
});
