/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-debug-ui.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { gutterMarks, isPythonPath, workspacePathOfUri } from "../../src/features/ide/model/debugGutter.ts";
import { DOCK_TABS, isDockTab } from "../../src/widgets/workbench/model/workbenchLayout.ts";

// --- workspacePathOfUri ---

test("workspacePathOfUri: workspace file URI returns the relative path", () => {
  assert.strictEqual(workspacePathOfUri("file:///workspace/app.py"), "app.py");
  assert.strictEqual(workspacePathOfUri("file:///workspace/src/x.py"), "src/x.py");
});

test("workspacePathOfUri: foreign scheme returns null", () => {
  assert.strictEqual(workspacePathOfUri("untitled:app.py"), null);
});

test("workspacePathOfUri: file outside the workspace returns null", () => {
  assert.strictEqual(workspacePathOfUri("file:///etc/x.py"), null);
});

test("workspacePathOfUri: empty rest returns null", () => {
  assert.strictEqual(workspacePathOfUri("file:///workspace/"), null);
});

test("workspacePathOfUri: dot-dot escape returns null", () => {
  assert.strictEqual(workspacePathOfUri("file:///workspace/../x.py"), null);
  assert.strictEqual(workspacePathOfUri("file:///workspace/a/../../x.py"), null);
});

// --- isPythonPath ---

test("isPythonPath: .py files are Python", () => {
  assert.strictEqual(isPythonPath("app.py"), true);
  assert.strictEqual(isPythonPath("src/x.py"), true);
});

test("isPythonPath: other extensions are not Python", () => {
  assert.strictEqual(isPythonPath("app.ts"), false);
  assert.strictEqual(isPythonPath("app.js"), false);
  assert.strictEqual(isPythonPath("py"), false);
});

// --- gutterMarks ---

test("gutterMarks: breakpoints only", () => {
  assert.deepStrictEqual(
    gutterMarks("app.py", { breakpoints: { "app.py": [3, 7] }, status: "idle", frames: [] }),
    [{ line: 3, kind: "breakpoint" }, { line: 7, kind: "breakpoint" }],
  );
});

test("gutterMarks: stopped in this file adds current", () => {
  assert.deepStrictEqual(
    gutterMarks("app.py", { breakpoints: { "app.py": [3] }, status: "stopped", frames: [{ path: "app.py", line: 5 }] }),
    [{ line: 3, kind: "breakpoint" }, { line: 5, kind: "current" }],
  );
});

test("gutterMarks: stopped in another file adds none", () => {
  assert.deepStrictEqual(
    gutterMarks("app.py", { breakpoints: { "app.py": [3] }, status: "stopped", frames: [{ path: "other.py", line: 5 }] }),
    [{ line: 3, kind: "breakpoint" }],
  );
});

test("gutterMarks: running adds none", () => {
  assert.deepStrictEqual(
    gutterMarks("app.py", { breakpoints: { "app.py": [3] }, status: "running", frames: [{ path: "app.py", line: 5 }] }),
    [{ line: 3, kind: "breakpoint" }],
  );
});

test("gutterMarks: a toString path returns []", () => {
  assert.deepStrictEqual(
    gutterMarks("toString", { breakpoints: {}, status: "idle", frames: [] }),
    [],
  );
});

// --- dock tab ---

test("DOCK_TABS includes debug and isDockTab accepts it", () => {
  assert.ok(DOCK_TABS.includes("debug"));
  assert.strictEqual(isDockTab("debug"), true);
});
