/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   second-brain-model.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

// Import the pure model submodules directly (not the barrel, which re-exports
// the React .tsx view — JSX isn't handled by Node's --experimental-strip-types).
import { type GraphModel, type NodeId, makeRecordNodeId } from "../../src/features/second-brain/model/graphModel.ts";
import { deriveGraph } from "../../src/features/second-brain/model/deriveGraph.ts";
import { diffGraph } from "../../src/features/second-brain/model/diffGraph.ts";
import { buildSearchIndex, filterByDatabase, neighborhood } from "../../src/features/second-brain/model/selectors.ts";
import { deriveTagConfig } from "../../src/features/second-brain/model/deriveTagConfig.ts";

const SOURCE = "mongodb";

/** A small but representative canonical state: projects + tasks (relation + tags). */
function buildState() {
  return {
    databases: {
      "db-projects": {
        id: "db-projects",
        name: "Projects",
        titlePropertyId: "p-title",
        properties: {
          "p-title": { id: "p-title", name: "Name", type: "title" },
          "p-status": { id: "p-status", name: "Status", type: "status" },
        },
      },
      "db-tasks": {
        id: "db-tasks",
        name: "Tasks",
        titlePropertyId: "t-title",
        properties: {
          "t-title": { id: "t-title", name: "Title", type: "title" },
          "t-status": { id: "t-status", name: "Status", type: "status" },
          "t-tags": { id: "t-tags", name: "Tags", type: "multi_select" },
          "t-project": {
            id: "t-project",
            name: "Project",
            type: "relation",
            relationConfig: { databaseId: "db-projects", type: "one_way" },
          },
        },
      },
    },
    pages: {
      "proj-1": page("proj-1", "db-projects", { "p-title": "Apollo", "p-status": "Active" }),
      "task-1": page("task-1", "db-tasks", {
        "t-title": "Build API",
        "t-status": "Doing",
        "t-tags": ["backend", "urgent"],
        "t-project": ["proj-1"],
      }),
      "task-2": page("task-2", "db-tasks", {
        "t-title": "Write tests",
        "t-status": "Todo",
        "t-tags": ["backend"],
        "t-project": ["proj-1"],
      }),
    },
    views: {},
  };
}

function page(id: string, databaseId: string, properties: Record<string, unknown>) {
  return {
    id,
    databaseId,
    properties,
    content: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    createdBy: "u1",
    lastEditedBy: "u1",
  };
}

const PROJ = makeRecordNodeId(SOURCE, "db-projects", "proj-1");
const TASK1 = makeRecordNodeId(SOURCE, "db-tasks", "task-1");
const TASK2 = makeRecordNodeId(SOURCE, "db-tasks", "task-2");

function hasEdge(model: GraphModel, a: NodeId, b: NodeId, kind?: string): boolean {
  return model.edges.some(
    (edge) =>
      ((edge.source === a && edge.target === b) || (edge.source === b && edge.target === a)) &&
      (kind === undefined || edge.kind === kind),
  );
}

test("derive: records, relation edges, and tag hubs", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = deriveGraph(buildState() as any, {
    source: SOURCE,
    tagConfig: { tagProperties: { "db-tasks": "t-tags" } },
  });

  // 3 records + 1 tag hub ("backend", used twice; "urgent" used once is dropped).
  assert.equal(model.stats.nodes, 4);
  assert.equal(model.stats.databases, 2); // tag hub has null databaseId → not counted
  assert.equal(model.stats.notes, 0);

  // relation edges: each task → its project (directed).
  assert.ok(hasEdge(model, TASK1, PROJ, "relation"), "task-1 relates to project");
  assert.ok(hasEdge(model, TASK2, PROJ, "relation"), "task-2 relates to project");

  // tag-hub edges connect both tasks to the "backend" hub.
  assert.ok(hasEdge(model, TASK1, "tag:backend", "tag"));
  assert.ok(hasEdge(model, TASK2, "tag:backend", "tag"));
  assert.equal(model.nodeById.has("tag:urgent"), false, "singleton tag makes no hub");

  // every record has a legible weight floor.
  for (const node of model.nodes) assert.ok(node.weight >= 0.2 && node.weight <= 1);
});

test("derive is deterministic across runs (stable ids)", () => {
  const opts = { source: SOURCE, tagConfig: { tagProperties: { "db-tasks": "t-tags" } } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = deriveGraph(buildState() as any, opts);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = deriveGraph(buildState() as any, opts);
  const ids = (model: GraphModel) => model.nodes.map((node) => node.id).sort();
  const eids = (model: GraphModel) => model.edges.map((edge) => edge.id).sort();
  assert.deepEqual(ids(a), ids(b));
  assert.deepEqual(eids(a), eids(b));
});

test("diff: editing one title yields exactly one updated node, no structural churn", () => {
  const opts = { source: SOURCE, tagConfig: { tagProperties: { "db-tasks": "t-tags" } } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prev = deriveGraph(buildState() as any, opts);

  const nextState = buildState();
  nextState.pages["task-1"].properties["t-title"] = "Build API v2";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const next = deriveGraph(nextState as any, opts);

  const patch = diffGraph(prev, next);
  assert.equal(patch.updatedNodes.length, 1);
  assert.equal(patch.updatedNodes[0].id, TASK1);
  assert.equal(patch.updatedNodes[0].label, "Build API v2");
  assert.equal(patch.addedNodes.length, 0);
  assert.equal(patch.removedNodeIds.length, 0);
  assert.equal(patch.addedEdges.length, 0);
  assert.equal(patch.removedEdgeIds.length, 0);
});

test("explicit edges: cross-record link kept; dangling endpoint dropped", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = deriveGraph(buildState() as any, {
    source: SOURCE,
    explicitEdges: [
      { from: TASK2, to: TASK1, type: "blocks", directed: true },
      { from: TASK1, to: makeRecordNodeId(SOURCE, "db-tasks", "ghost"), type: "blocks" },
    ],
  });
  assert.ok(hasEdge(model, TASK1, TASK2, "relation"), "explicit 'blocks' edge present");
  assert.ok(!model.nodeById.has(makeRecordNodeId(SOURCE, "db-tasks", "ghost")));
});

test("tag pairwise mode links members directly without a hub", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = deriveGraph(buildState() as any, {
    source: SOURCE,
    tagConfig: { tagProperties: { "db-tasks": "t-tags" }, materializeTagNodes: false, maxPairwiseTagDegree: 50 },
  });
  assert.equal(model.nodeById.has("tag:backend"), false, "no hub in pairwise mode");
  assert.ok(hasEdge(model, TASK1, TASK2, "tag"), "members linked directly");
});

test("deriveTagConfig auto-detects the tag property (Phase 4 local tag edges)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = deriveTagConfig(buildState() as any);
  assert.equal(config.tagProperties["db-tasks"], "t-tags");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = deriveGraph(buildState() as any, { source: SOURCE, tagConfig: config });
  assert.ok(model.nodeById.has("tag:backend"), "shared tag becomes a hub without explicit config");
});

test("selectors: neighborhood, filterByDatabase, search", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = deriveGraph(buildState() as any, { source: SOURCE });

  const hood = neighborhood(model, PROJ, 1);
  assert.ok(hood.nodeIds.has(TASK1) && hood.nodeIds.has(TASK2));

  // hide projects → project node gone, tasks remain.
  const visible = filterByDatabase(model, new Set(["db-tasks"]));
  assert.ok(!visible.nodeIds.has(PROJ));
  assert.ok(visible.nodeIds.has(TASK1));

  const results = buildSearchIndex(model).search("apollo");
  assert.deepEqual(results, [PROJ]);
});

test("scale guard: 5k records derive fast and diff stays incremental", () => {
  const databases: Record<string, unknown> = {
    "db-projects": {
      id: "db-projects",
      name: "Projects",
      titlePropertyId: "p-title",
      properties: { "p-title": { id: "p-title", name: "Name", type: "title" } },
    },
    "db-tasks": {
      id: "db-tasks",
      name: "Tasks",
      titlePropertyId: "t-title",
      properties: {
        "t-title": { id: "t-title", name: "Title", type: "title" },
        "t-project": {
          id: "t-project",
          name: "Project",
          type: "relation",
          relationConfig: { databaseId: "db-projects", type: "one_way" },
        },
      },
    },
  };
  const pages: Record<string, unknown> = {};
  for (let i = 0; i < 50; i += 1) pages[`proj-${i}`] = page(`proj-${i}`, "db-projects", { "p-title": `P${i}` });
  for (let i = 0; i < 5000; i += 1) {
    pages[`task-${i}`] = page(`task-${i}`, "db-tasks", { "t-title": `T${i}`, "t-project": [`proj-${i % 50}`] });
  }
  const state = { databases, pages, views: {} };

  const t0 = performance.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prev = deriveGraph(state as any, { source: SOURCE });
  const deriveMs = performance.now() - t0;

  assert.equal(prev.stats.nodes, 5050);
  assert.equal(prev.stats.edges, 5000); // one relation edge per task, no explosion
  assert.ok(deriveMs < 2000, `derive of 5k should be well under 2s (was ${deriveMs.toFixed(1)}ms)`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (state.pages as any)["task-7"].properties["t-title"] = "edited";
  const t1 = performance.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const next = deriveGraph(state as any, { source: SOURCE });
  const patch = diffGraph(prev, next);
  const diffMs = performance.now() - t1;

  assert.equal(patch.updatedNodes.length, 1);
  assert.equal(patch.updatedNodes[0].id, makeRecordNodeId(SOURCE, "db-tasks", "task-7"));
  assert.ok(diffMs < 500, `derive+diff after one edit should be fast (was ${diffMs.toFixed(1)}ms)`);
});
