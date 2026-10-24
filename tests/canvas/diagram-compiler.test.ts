/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagram-compiler.test.ts                                    +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The living-diagram compiler (devil C108, C109, C110): a CLOSED spec in,
// mermaid text out.
//
// The compiler is the TRUST BOUNDARY: every label of a diagram comes from a
// shared page, a database or the AI — from people the reader does not trust.
// The tests below hold three lines at once:
//
//   1. the spec is CLOSED: an unknown key, a wrong uuid, a depth out of range
//      or a field that smells like a query is REFUSED, never repaired;
//   2. the output is DETERMINISTIC: the same data gives the same bytes, so a
//      diagram does not dance when a page is renamed;
//   3. the output is LOCKED: a hostile label cannot close its bracket, open a
//      statement, start a directive or bind a callback — the locked renderer
//      would strip NOTHING from what the compiler wrote.

import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeMermaidSource } from "@osionos/ui/molecules/MermaidDiagram/lockedMermaid";

import {
  compileGraph,
  compileHierarchy,
  compilePipeline,
  compileSchema,
} from "@/features/diagram/model/compile";
import { MAX_EDGES, MAX_NODES, type DiagramIR } from "@/features/diagram/model/diagramIR";
import { parseDiagramSpec, type DiagramSpec } from "@/features/diagram/model/diagramSpec";
import {
  escapeLabel,
  irToMermaid,
  mermaidSpecToMermaid,
} from "@/features/diagram/model/toMermaid";

const UUID_A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const UUID_B = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const UUID_C = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

/** Parse a spec that MUST parse. */
function spec(input: unknown): DiagramSpec {
  const result = parseDiagramSpec(input);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  if (!result.ok) throw new Error(result.error);
  return result.spec;
}

/** The only lines the emitter may write. */
const LINE_GRAMMAR = [
  /^flowchart (LR|TB)$/,
  /^n\d+\["[^"]*"\]$/,
  /^n\d+ --> n\d+$/,
  /^n\d+ -- "[^"]*" --> n\d+$/,
  /^subgraph g\d+\["[^"]*"\]$/,
  /^end$/,
];

/**
 * The locked-diagram check: the exact lines the IR implies, every line inside
 * the grammar, nothing dangerous outside a label, and the locked renderer
 * would strip NOTHING.
 */
function assertLockedDiagram(out: string, ir: DiagramIR): void {
  const lines = out.split("\n");
  assert.equal(
    lines.length,
    1 + ir.nodes.length + ir.edges.length + ir.groups.length * 2,
    `the diagram has ${lines.length} lines, the IR implies ${
      1 + ir.nodes.length + ir.edges.length + ir.groups.length * 2
    }`,
  );
  for (const line of lines) {
    assert.ok(
      LINE_GRAMMAR.some((production) => production.test(line)),
      `a line outside the grammar: ${JSON.stringify(line)}`,
    );
    // What is left of the line once the labels are taken out: the syntax.
    // The arrow is syntax too, so it goes before the check.
    const outside = line.replace(/"[^"]*"/g, "").replace(/-->/g, "");
    for (const forbidden of ["click", "%%", "<", ">", "javascript:"]) {
      assert.ok(
        !outside.includes(forbidden),
        `a line carries ${forbidden}: ${JSON.stringify(line)}`,
      );
    }
    for (const label of line.match(/"[^"]*"/g) ?? []) {
      const content = label.slice(1, -1);
      assert.ok(
        !/[<>[\]]/.test(content),
        `a label carries a raw bracket: ${JSON.stringify(label)}`,
      );
      assert.ok(
        !content.includes('"'),
        `a label carries a raw quote: ${JSON.stringify(label)}`,
      );
    }
  }
  assert.equal(sanitizeMermaidSource(out), out, "the locked renderer would strip something");
}

/* -------------------------------------------------------------------------- */
/* The closed spec                                                              */
/* -------------------------------------------------------------------------- */

test("the closed spec: every kind parses", () => {
  assert.equal(spec({ kind: "mermaid", source: "flowchart LR\nA-->B" }).kind, "mermaid");
  assert.equal(spec({ kind: "schema", databaseIds: [UUID_A, UUID_B] }).kind, "schema");
  assert.equal(
    spec({ kind: "graph", pageId: UUID_A, depth: 2, kinds: ["link", "mention"] }).kind,
    "graph",
  );
  assert.equal(spec({ kind: "hierarchy", rootPageId: UUID_A, depth: 4 }).kind, "hierarchy");
  assert.equal(
    spec({ kind: "pipeline", databaseId: UUID_A, statusPropertyId: "status" }).kind,
    "pipeline",
  );
  // The optional fields of every kind.
  assert.equal(
    spec({ kind: "mermaid", source: "flowchart LR", direction: "TB", title: "A title" })
      .direction,
    "TB",
  );
  assert.equal(spec({ kind: "schema", databaseIds: [UUID_A], title: "A title" }).title, "A title");
});

test("the closed spec: everything else is refused", () => {
  const refused: unknown[] = [
    // An unknown key, on every kind.
    { kind: "mermaid", source: "flowchart LR", extra: 1 },
    { kind: "schema", databaseIds: [UUID_A], extra: 1 },
    { kind: "graph", pageId: UUID_A, depth: 1, kinds: [], extra: 1 },
    { kind: "hierarchy", rootPageId: UUID_A, depth: 1, extra: 1 },
    { kind: "pipeline", databaseId: UUID_A, statusPropertyId: "s", extra: 1 },
    // A wrong uuid.
    { kind: "graph", pageId: "1234", depth: 1, kinds: [] },
    { kind: "hierarchy", rootPageId: "1234", depth: 1 },
    // A database id is a LOOKUP KEY, not a uuid: the app names its own
    // databases (`db-tasks`), so the rule is a short boring string — and
    // what it refuses is a key with a space or a bracket in it.
    { kind: "schema", databaseIds: ["not a uuid"] },
    { kind: "pipeline", databaseId: "<database>", statusPropertyId: "s" },
    // A depth out of range.
    { kind: "graph", pageId: UUID_A, depth: 3, kinds: [] },
    { kind: "graph", pageId: UUID_A, depth: 0, kinds: [] },
    { kind: "hierarchy", rootPageId: UUID_A, depth: 5 },
    { kind: "hierarchy", rootPageId: UUID_A, depth: 0 },
    // Thirteen databases: twelve is the ceiling.
    { kind: "schema", databaseIds: Array.from({ length: 13 }, () => UUID_A) },
    // A field that smells like a query.
    { kind: "mermaid", source: "flowchart LR", sql: "select * from pages" },
    { kind: "schema", databaseIds: [UUID_A], sql: "select * from pages" },
    { kind: "schema", databaseIds: [UUID_A], query: "select * from pages" },
    // A kind that does not exist, and a kind of edge that does not exist.
    { kind: "sql", query: "select 1" },
    { kind: "graph", pageId: UUID_A, depth: 1, kinds: ["sql"] },
    // A source that is too long, and a status property that is too long.
    { kind: "mermaid", source: "x".repeat(20_001) },
    { kind: "pipeline", databaseId: UUID_A, statusPropertyId: "s".repeat(81) },
    // A title that is too long.
    { kind: "mermaid", source: "flowchart LR", title: "t".repeat(121) },
  ];
  for (const input of refused) {
    const result = parseDiagramSpec(input);
    assert.equal(result.ok, false, `a refused spec parsed: ${JSON.stringify(input)}`);
  }
});

/* -------------------------------------------------------------------------- */
/* The golden diagrams                                                          */
/* -------------------------------------------------------------------------- */

test("golden: the schema of two databases", () => {
  const ir = compileSchema([
    { id: "db-authors", name: "Authors", properties: [{ id: "p1", name: "Name", type: "text" }] },
    {
      id: "db-books",
      name: "Books",
      properties: [
        { id: "p2", name: "Title", type: "text" },
        { id: "p3", name: "Author", type: "relation", relationTo: "db-authors" },
      ],
    },
  ]);
  assert.equal(
    irToMermaid(ir),
    [
      "flowchart LR",
      'n0["Authors: Name (text)"]',
      'n1["Books: Author (relation), Title (text)"]',
      'n1 -- "Author" --> n0',
    ].join("\n"),
  );
});

test("golden: the neighbourhood of a page", () => {
  const ir = compileGraph(
    { id: "p-center", title: "Center" },
    [
      { pageId: "p-beta", title: "Beta", kind: "link", depth: 1 },
      { pageId: "p-alpha", title: "Alpha", kind: "mention", depth: 2, via: "Gamma" },
    ],
  );
  assert.equal(
    irToMermaid(ir),
    [
      "flowchart LR",
      'n0["Center"]',
      'n1["Alpha"]',
      'n2["Beta"]',
      'n0 -- "mention via Gamma" --> n1',
      'n0 -- "link" --> n2',
    ].join("\n"),
  );
});

test("golden: the tree under a page", () => {
  const ir = compileHierarchy(
    { id: "p-root", title: "Root" },
    [
      { id: "p-c2", parentId: "p-c1", title: "Child B" },
      { id: "p-c1", parentId: "p-root", title: "Child A" },
      { id: "p-c3", parentId: "p-root", title: "Child C" },
    ],
    2,
  );
  assert.equal(
    irToMermaid(ir),
    [
      "flowchart LR",
      'n0["Root"]',
      'n1["Child A"]',
      'n2["Child C"]',
      'n3["Child B"]',
      "n0 --> n1",
      "n0 --> n2",
      "n1 --> n3",
    ].join("\n"),
  );
});

test("golden: the pipeline of a database", () => {
  const ir = compilePipeline(
    [{ id: "s-todo", name: "Todo" }, { id: "s-done", name: "Done" }],
    [
      { id: "t-write", title: "Write", statusId: "s-todo" },
      { id: "t-ship", title: "Ship", statusId: "s-done" },
      { id: "t-orphan", title: "Orphan", statusId: "s-gone" },
    ],
  );
  assert.equal(
    irToMermaid(ir),
    [
      "flowchart LR",
      'subgraph g0["Done"]',
      'n1["Ship"]',
      "end",
      'subgraph g1["Todo"]',
      'n2["Write"]',
      "end",
      'subgraph g2["No status"]',
      'n0["Orphan"]',
      "end",
    ].join("\n"),
  );
});

test("the options: the direction is drawn, the title is NOT", () => {
  const ir = compileGraph({ id: "p-center", title: "Center" }, []);
  assert.equal(irToMermaid(ir, { direction: "TB" }).split("\n")[0], "flowchart TB");
  // The title is never front matter: the locked renderer strips a front-matter
  // block, so the title would VANISH. The block shows it as text.
  assert.equal(
    irToMermaid(ir, { direction: "TB", title: "A title" }),
    irToMermaid(ir, { direction: "TB" }),
  );
});

/* -------------------------------------------------------------------------- */
/* The determinism                                                              */
/* -------------------------------------------------------------------------- */

test("the same data gives byte-identical text, whatever the order it arrives in", () => {
  const databases = [
    { id: "db-b", name: "Beta", properties: [{ id: "p1", name: "One", type: "text" }] },
    { id: "db-a", name: "Alpha", properties: [{ id: "p2", name: "Two", type: "text" }] },
  ];
  const neighbors = [
    { pageId: "p-2", title: "Gamma", kind: "link", depth: 1 },
    { pageId: "p-1", title: "Beta", kind: "mention", depth: 1 },
  ];
  const children = [
    { id: "p-b", parentId: "p-a", title: "Beta" },
    { id: "p-a", parentId: "p-root", title: "Alpha" },
  ];
  const statuses = [
    { id: "s-2", name: "Todo" },
    { id: "s-1", name: "Done" },
  ];
  const rows = [
    { id: "r-2", title: "Beta", statusId: "s-1" },
    { id: "r-1", title: "Alpha", statusId: "s-2" },
  ];
  const root = { id: "p-root", title: "Root" };
  const center = { id: "p-center", title: "Center" };

  const pairs: Array<[string, string]> = [
    [
      irToMermaid(compileSchema(databases)),
      irToMermaid(compileSchema([...databases].reverse())),
    ],
    [
      irToMermaid(compileGraph(center, neighbors)),
      irToMermaid(compileGraph(center, [...neighbors].reverse())),
    ],
    [
      irToMermaid(compileHierarchy(root, children, 3)),
      irToMermaid(compileHierarchy(root, [...children].reverse(), 3)),
    ],
    [
      irToMermaid(compilePipeline(statuses, rows)),
      irToMermaid(compilePipeline([...statuses].reverse(), [...rows].reverse())),
    ],
  ];
  for (const [left, right] of pairs) {
    assert.equal(left, right);
  }
});

/* -------------------------------------------------------------------------- */
/* The caps                                                                     */
/* -------------------------------------------------------------------------- */

test("the caps: a thousand nodes become one hundred and fifty, and the IR says so", () => {
  const databases = Array.from({ length: 1000 }, (_, index) => ({
    id: `db-${String(index).padStart(4, "0")}`,
    name: `Database ${String(index).padStart(4, "0")}`,
    properties: [],
  }));
  const ir = compileSchema(databases);
  assert.equal(ir.nodes.length, MAX_NODES);
  assert.equal(ir.truncated, true);
  // The kept ones are the FIRST of the stable order.
  const expected = [...databases]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, MAX_NODES);
  assert.deepEqual(
    ir.nodes.map((node) => node.id),
    expected.map((database) => database.id),
  );
});

test("the caps: the edges are capped too, and a dropped node takes its edges", () => {
  const databases = Array.from({ length: 200 }, (_, index) => ({
    id: `db-${String(index).padStart(4, "0")}`,
    name: `Database ${String(index).padStart(4, "0")}`,
    properties: Array.from({ length: 5 }, (_, offset) => ({
      id: `p-${index}-${offset}`,
      name: `Property ${offset}`,
      type: "relation",
      relationTo: `db-${String((index + offset + 1) % 200).padStart(4, "0")}`,
    })),
  }));
  const ir = compileSchema(databases);
  assert.equal(ir.nodes.length, MAX_NODES);
  assert.equal(ir.edges.length, MAX_EDGES);
  assert.equal(ir.truncated, true);
  // No edge points at a node that is not there: mermaid would draw it.
  const ids = new Set(ir.nodes.map((node) => node.id));
  for (const edge of ir.edges) {
    assert.ok(ids.has(edge.from) && ids.has(edge.to));
  }
});

/* -------------------------------------------------------------------------- */
/* The trust boundary (devil C109)                                              */
/* -------------------------------------------------------------------------- */

/** The labels a shared page, a database or the AI could put in a diagram. */
const HOSTILE_LABELS = [
  `<img src=x onerror=alert(1)>`,
  `"]; click n0 call alert(1); n9["`,
  `x"] --> n1\n%%{init: {"securityLevel":"loose"}}%%`,
  `a\nclick n0 "https://evil.example"`,
  `---\nconfig: {}\n---`,
  `<a href="javascript:alert(1)">x</a>`,
  `<foreignObject>`,
  `]]`,
  `"`,
  "x".repeat(10_000),
  `\u0000\u202E`,
];

function hostileGraph(): DiagramIR {
  return compileGraph(
    { id: "p-center", title: HOSTILE_LABELS[0] },
    HOSTILE_LABELS.map((label, index) => ({
      pageId: `p-${index}`,
      title: label,
      kind: "link",
      depth: 1,
      via: label,
    })),
  );
}

function hostileSchema(): DiagramIR {
  return compileSchema(
    HOSTILE_LABELS.map((label, index) => ({
      id: `db-${index}`,
      name: label,
      properties: [
        { id: `prop-${index}`, name: label, type: label },
        { id: `rel-${index}`, name: label, type: "relation", relationTo: `db-${index + 1}` },
      ],
    })),
  );
}

function hostilePipeline(): DiagramIR {
  return compilePipeline(
    HOSTILE_LABELS.map((label, index) => ({ id: `s-${index}`, name: label })),
    HOSTILE_LABELS.map((label, index) => ({
      id: `row-${index}`,
      title: label,
      statusId: `s-${index}`,
    })),
  );
}

test("the trust boundary: a hostile label stays inside its box", () => {
  for (const ir of [hostileGraph(), hostileSchema(), hostilePipeline()]) {
    assertLockedDiagram(irToMermaid(ir), ir);
  }
});

test("the trust boundary: the node ids are generated, never the data ids", () => {
  const ir = hostileSchema();
  const out = irToMermaid(ir);
  for (const node of ir.nodes) {
    assert.ok(!out.includes(node.id), `the data id ${node.id} reached the text`);
  }
  assert.ok(/^n0\[/.test(out.split("\n")[1]));
});

test("the trust boundary: a long label is cut, a control character never is", () => {
  const long = escapeLabel("x".repeat(10_000));
  assert.equal(long.length, 80);
  assert.ok(long.endsWith("…"));
  // A NUL and a right-to-left override are gone, not carried.
  const control = escapeLabel("\u0000\u202E");
  assert.equal(control, "");
  assert.ok(!control.includes("\u202E"));
  // A newline is a space, never a second line.
  assert.equal(escapeLabel("a\nb"), "a b");
});

test("a label reads as written: brackets and quotes become their fullwidth forms, never entity codes", () => {
  // The locked renderer draws labels with htmlLabels off, where mermaid's
  // entity codes are shown literally ("&#40;") — measured on the offline build.
  assert.equal(escapeLabel("Q3 (draft) R&D #12"), "Q3 (draft) R&D #12");
  assert.equal(
    escapeLabel('say "hi" [x] {y} a;b 50% <b>|`'),
    "say \uFF02hi\uFF02 \uFF3Bx\uFF3D \uFF5By\uFF5D a\uFF1Bb 50\uFF05 \uFF1Cb\uFF1E\uFF5C\uFF40",
  );
  // No entity can form: both need an ASCII ";".
  assert.ok(!escapeLabel("#35; &amp; &#34;").includes(";"));
});

test("an empty label is never empty: mermaid's lexer has no empty string", () => {
  // A `n0[""]` is a PARSE ERROR in mermaid 11, not an empty box.
  const ir = compileGraph({ id: "p-center", title: "\u0000\u202E" }, []);
  assert.equal(irToMermaid(ir), 'flowchart LR\nn0["Untitled"]');
});

test("the trust boundary: the hand-written mermaid goes through the locked path", () => {
  const parsed = spec({
    kind: "mermaid",
    source:
      '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\nA-->B\nclick A "https://evil.example"',
  });
  if (parsed.kind !== "mermaid") throw new Error("the spec should be a mermaid one");
  const out = mermaidSpecToMermaid(parsed);
  assert.ok(!out.includes("%%"), "a directive survived");
  assert.ok(!out.includes("click"), "a binding survived");
  assert.ok(out.includes("flowchart LR"));
});

test("C109: the caps are 150 nodes and 400 edges, below the renderer's 500 edges", () => {
  assert.equal(MAX_NODES, 150);
  assert.equal(MAX_EDGES, 400);
});
