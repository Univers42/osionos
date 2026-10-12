/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-file-ops.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import { buildExplorerRows, flattenVisible, type DirState } from "../../src/features/ide/model/explorerRows.ts";
import { explorerKeyAction } from "../../src/features/ide/model/explorerKeys.ts";
import { createWorkspaceFileOpsWith } from "../../src/features/ide/model/workspaceFileOps.ts";
import { WorkspacePathError } from "../../src/features/ide/model/workspacePath.ts";
import { createMemProvider } from "../../src/features/ide/vfs/memProvider.ts";
import { createMountTable } from "../../src/features/ide/vfs/mountTable.ts";
import { buildVPath } from "../../src/features/ide/vfs/vpath.ts";

// workspaceMounts.ts pulls in the page store (not node-loadable), so the test
// builds the same URI shape with the real vpath builder.
const WORKSPACE_SCHEME = "workspace";
const toUri = (ws: string, rel: string): string => buildVPath(WORKSPACE_SCHEME, ws, rel.split("/").filter(Boolean)).uri;

function setup() {
  const mounts = createMountTable();
  mounts.mount(WORKSPACE_SCHEME, "ws1", createMemProvider(WORKSPACE_SCHEME));
  return createWorkspaceFileOpsWith(mounts, "ws1", toUri);
}

const names = (entries: { name: string }[]) => entries.map((e) => e.name);

test("buildExplorerRows: dirs first, natural order, folder meta hidden, page labels", () => {
  const rows = buildExplorerRows([
    { name: "file10.ts", kind: "file" },
    { name: "file2.ts", kind: "file" },
    { name: "_folder.omd", kind: "file" },
    { name: "Roadmap.omd", kind: "file" },
    { name: "zeta", kind: "dir" },
    { name: "Alpha", kind: "dir" },
    { name: "beta", kind: "dir" },
  ]);
  assert.deepEqual(names(rows), ["Alpha", "beta", "zeta", "file2.ts", "file10.ts", "Roadmap.omd"]);
  const page = rows.find((r) => r.name === "Roadmap.omd");
  assert.deepEqual(page, { name: "Roadmap.omd", kind: "page", label: "Roadmap" });
  assert.equal(rows.find((r) => r.name === "file2.ts")?.kind, "code");
  assert.equal(rows.find((r) => r.name === "zeta")?.kind, "dir");
});

test("buildExplorerRows: case-only ties are deterministic", () => {
  const a = buildExplorerRows([{ name: "b", kind: "file" }, { name: "B", kind: "file" }]);
  const b = buildExplorerRows([{ name: "B", kind: "file" }, { name: "b", kind: "file" }]);
  assert.deepEqual(names(a), names(b));
});

test("ops: create, read, write, rename, move, delete through the mount table", async () => {
  const ops = setup();
  await ops.createDir("src");
  await ops.createFile("src/main.ts", "let a = 1");
  assert.equal(await ops.readFile("src/main.ts"), "let a = 1");
  await assert.rejects(ops.createFile("src/main.ts"), /AlreadyExists/);
  await ops.writeFile("src/main.ts", "let a = 2");
  assert.equal(await ops.readFile("src/main.ts"), "let a = 2");

  await ops.rename("src/main.ts", "index.ts");
  assert.deepEqual(names(await ops.list("src")), ["index.ts"]);

  await ops.createDir("lib");
  await ops.move("src/index.ts", "lib");
  assert.deepEqual(names(await ops.list("src")), []);
  assert.deepEqual(names(await ops.list("lib")), ["index.ts"]);

  await ops.move("lib/index.ts", "");
  assert.deepEqual(names(await ops.list("")), ["index.ts", "lib", "src"]);

  await ops.remove("lib");
  assert.deepEqual(names(await ops.list("")), ["index.ts", "src"]);
});

test("ops: a folder cannot move into itself or a descendant", async () => {
  const ops = setup();
  await ops.createDir("a");
  await ops.createDir("a/b");
  for (const target of ["a", "a/b"]) {
    await assert.rejects(ops.move("a", target), (e: unknown) => e instanceof WorkspacePathError && e.problem === "into-self");
  }
});

test("ops: paths with spaces, percent and unicode round-trip", async () => {
  const ops = setup();
  await ops.createFile("my notes 100%.omd", "x");
  await ops.createFile("é.ts", "y");
  assert.deepEqual(names(await ops.list("")).sort(), ["my notes 100%.omd", "é.ts"]);
});

test("path validation rejects dot segments, absolute, empty segments, control chars", async () => {
  const ops = setup();
  const expectProblem = (problem: string) => (e: unknown) => e instanceof WorkspacePathError && e.problem === problem;
  await assert.rejects(ops.createFile("../x"), expectProblem("dot-segment"));
  await assert.rejects(ops.createFile("a/./x"), expectProblem("dot-segment"));
  await assert.rejects(ops.createFile("/abs"), expectProblem("absolute"));
  await assert.rejects(ops.createFile("workspace://ws1/x"), expectProblem("absolute"));
  await assert.rejects(ops.createFile("a//b"), expectProblem("empty-segment"));
  await assert.rejects(ops.createDir("a/"), expectProblem("empty-segment"));
  await assert.rejects(ops.createFile("a\u0000b"), expectProblem("control-char"));
  await assert.rejects(ops.createFile("a\nb"), expectProblem("control-char"));
  await assert.rejects(ops.createFile(""), expectProblem("empty"));
  await assert.rejects(ops.remove(""), expectProblem("empty"));
  await ops.createFile("ok");
  await assert.rejects(ops.rename("ok", "x/y"), expectProblem("separator"));
  await assert.rejects(ops.rename("ok", ".."), expectProblem("dot-segment"));
});

test("flattenVisible + explorerKeyAction: ARIA coordinates and key map", () => {
  const ready = (rows: Parameters<typeof buildExplorerRows>[0]): DirState => ({ status: "ready", rows: buildExplorerRows(rows) });
  const dirs = {
    "": ready([{ name: "src", kind: "dir" }, { name: "a.ts", kind: "file" }]),
    src: ready([{ name: "m.ts", kind: "file" }]),
  };
  const open = new Set(["src"]);
  const visible = flattenVisible(dirs, open);
  assert.deepEqual(visible.map((v) => [v.rel, v.level, v.posInSet, v.setSize]), [
    ["src", 1, 1, 2], ["src/m.ts", 2, 1, 1], ["a.ts", 1, 2, 2],
  ]);
  assert.deepEqual(flattenVisible(dirs, new Set()).map((v) => v.rel), ["src", "a.ts"]);

  assert.deepEqual(explorerKeyAction("ArrowDown", visible, "src", open), { type: "focus", rel: "src/m.ts" });
  assert.deepEqual(explorerKeyAction("ArrowRight", visible, "src", open), { type: "focus", rel: "src/m.ts" });
  assert.deepEqual(explorerKeyAction("ArrowRight", visible, "src", new Set()), { type: "expand", rel: "src" });
  assert.deepEqual(explorerKeyAction("ArrowLeft", visible, "src", open), { type: "collapse", rel: "src" });
  assert.deepEqual(explorerKeyAction("ArrowLeft", visible, "src/m.ts", open), { type: "focus", rel: "src" });
  assert.deepEqual(explorerKeyAction("End", visible, "src", open), { type: "focus", rel: "a.ts" });
  assert.deepEqual(explorerKeyAction("Home", visible, "a.ts", open), { type: "focus", rel: "src" });
  assert.equal(explorerKeyAction("ArrowUp", visible, "src", open), null);
  assert.deepEqual(explorerKeyAction("F2", visible, "a.ts", open), { type: "rename", rel: "a.ts" });
  assert.deepEqual(explorerKeyAction("Delete", visible, "a.ts", open), { type: "delete", rel: "a.ts" });
  assert.deepEqual(explorerKeyAction("Enter", visible, "a.ts", open), { type: "activate", rel: "a.ts" });
});

test("buildExplorerRows: order does not depend on input order or locale", () => {
  const entries = ["b10", "B2", "a", "A", "b2", "é"].map((name) => ({ name, kind: "file" as const }));
  const forward = names(buildExplorerRows(entries));
  assert.deepEqual(names(buildExplorerRows([...entries].reverse())), forward);
  assert.deepEqual(forward, ["A", "a", "B2", "b2", "b10", "é"]);
});

test("rename refuses names the sandbox materializer would rewrite", async () => {
  const ops = setup();
  await ops.createFile("ok");
  const unsafe = (e: unknown) => e instanceof WorkspacePathError && e.problem === "unsafe-name";
  await assert.rejects(ops.rename("ok", " lead"), unsafe);
  await assert.rejects(ops.rename("ok", "a..b"), unsafe);
  await assert.rejects(ops.rename("ok", "a\\b"), unsafe);
  await ops.rename("ok", "fine.ts");
  assert.deepEqual(names(await ops.list("")), ["fine.ts"]);
});
