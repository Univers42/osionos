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
import { compileSchema } from "@/features/diagram/model/compile";
import {
  pipelineInput,
  schemaInput,
  type DatabaseLike,
  type PageLike,
} from "@/features/diagram/model/databaseInput";
import { diagramBlockToMarkdown } from "@/features/diagram/model/diagramMarkdown";
import { diagramRenderMode } from "@/features/diagram/model/diagramRenderMode";
import { hierarchyInput, type HierarchyPage } from "@/features/diagram/model/hierarchyInput";
import { parseDiagramSpec } from "@/features/diagram/model/diagramSpec";
import { irToMermaid } from "@/features/diagram/model/toMermaid";
import {
  blockToMarkdown,
  serializeBlocksToMarkdown,
} from "@/services/page-actions/pageMarkdownSerialize";

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
