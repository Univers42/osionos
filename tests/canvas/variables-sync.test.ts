/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   variables-sync.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The live pipeline over the real page store: env.json pages → useVariablesStore →
// the placement a page resolves in. Pins which edits re-render chip blocks (a version
// bump) and which must not: typing in an ordinary page bumps nothing.

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import "./support/user-store-env.ts";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");
const { startVariablesSync } = await import("../../src/features/variables/model/variablesSync.ts");
const { useVariablesStore } = await import("../../src/features/variables/model/useVariablesStore.ts");
const { variablePlacement, variableScopeFor } = await import("../../src/features/variables/model/variableScope.ts");
const { resolveVariable } = await import("../../src/features/variables/model/variableResolver.ts");

type Page = Record<string, unknown> & { _id: string };

Reflect.set(globalThis, "document", { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
Reflect.set(globalThis, "__playgroundUserStore", {
  getState: () => ({ activeSession: () => ({ userId: "u", privateWorkspaces: [{ _id: "w", role: "owner", permissions: ["read", "update"] }], sharedWorkspaces: [] }) }),
});

const env = (id: string, parentPageId: string | null, values: object, extra: object = {}): Page => ({
  _id: id, workspaceId: "w", ownerId: "u", title: "env.json", surface: "code", parentPageId,
  content: [{ id: `${id}-code`, type: "code", content: JSON.stringify(values) }], ...extra,
});
const doc = (id: string, parentPageId: string | null, extra: object = {}): Page => ({
  _id: id, workspaceId: "w", ownerId: "u", title: id, parentPageId, content: [{ id: `${id}-b`, type: "paragraph", content: "" }], ...extra,
});

// Workspace → Project (env.json, Client) → Sprint (Status) → Task.
function workspace(): Page[] {
  return [
    env("env-root", null, { PATH: "/bin", CLIENT: "Nobody", PROJECT_ONLY: "no" }),
    doc("Project", null, { properties: [{ key: "client", label: "Client", type: "text", value: "Acme" }] }),
    env("env-project", "Project", { PATH: "{{PATH}}:/project", PROJECT_ONLY: "yes" }),
    doc("Sprint", "Project", { properties: [{ key: "status", label: "Status", type: "select", value: "Doing" }] }),
    doc("Task", "Sprint"),
  ];
}

const setPages = (pages: Page[]) =>
  usePageStore.setState({ ...derivePageState({ w: pages as never }, usePageStore.getState() as never), pageRevisions: {} } as never);
const replacePage = (id: string, patch: object) =>
  setPages((usePageStore.getState().pages.w as unknown as Page[]).map((p) => (p._id === id ? { ...p, ...patch } : p)));
const value = (pageId: string, expr: string) => resolveVariable(expr, variableScopeFor(pageId))?.text ?? null;
const version = () => useVariablesStore.getState().version;

let stop: () => void = () => {};
beforeEach(() => {
  useVariablesStore.setState({ byWorkspace: {}, version: 0 });
  setPages(workspace());
  stop = startVariablesSync();
});
afterEach(() => stop());

test("a sub-page sees its ancestors' env.json innermost first, then the workspace one", () => {
  const placement = variablePlacement("Task");
  assert.deepEqual(placement.pages.map((p) => p.title), ["Task", "Sprint", "Project"]);
  assert.deepEqual(placement.owners.map((o) => o?._id ?? null), ["Project", null]);
  assert.equal(value("Task", "PATH"), "/bin:/project");
  assert.equal(value("Task", "PROJECT_ONLY"), "yes");
  assert.equal(value("Task", "page.Client"), "Acme", "inherited from Project");
  assert.equal(value("Task", "page.Status"), "Doing", "inherited from Sprint");
  assert.equal(value("Task", "PAGE"), "Task");
});

test("a page outside the subtree sees only the workspace env.json", () => {
  setPages([...(usePageStore.getState().pages.w as unknown as Page[]), doc("Elsewhere", null)]);
  assert.deepEqual(variablePlacement("Elsewhere").owners, [null]);
  assert.equal(value("Elsewhere", "PATH"), "/bin");
  assert.equal(value("Elsewhere", "page.Client"), null);
});

test("typing in an ordinary page re-parses nothing and bumps nothing", () => {
  const files = useVariablesStore.getState().byWorkspace.w;
  const before = version();
  for (let i = 0; i < 20; i += 1) replacePage("Task", { content: [{ id: "Task-b", type: "paragraph", content: "x".repeat(i) }] });
  assert.equal(version(), before);
  assert.equal(useVariablesStore.getState().byWorkspace.w, files, "same files array: no chip block re-renders");
});

test("editing one env.json re-parses that file only and updates the values", () => {
  const [root, project] = useVariablesStore.getState().byWorkspace.w;
  const before = version();
  replacePage("env-project", env("env-project", "Project", { PATH: "{{PATH}}:/v2" }));
  const [rootAfter, projectAfter] = useVariablesStore.getState().byWorkspace.w;
  assert.ok(version() > before);
  assert.equal(rootAfter.definitions, root.definitions, "untouched file keeps its parse");
  assert.notEqual(projectAfter.definitions, project.definitions);
  assert.equal(value("Task", "PATH"), "/bin:/v2");
  assert.equal(value("Task", "PROJECT_ONLY"), "no", "removed from the inner file, the outer one shows through");
});

test("a rename, a property edit or a move bumps the version and the values follow", () => {
  let before = version();
  replacePage("Task", { title: "Renamed" });
  assert.ok(version() > before);
  assert.equal(value("Task", "PAGE"), "Renamed");

  before = version();
  replacePage("Sprint", { properties: [{ key: "status", label: "Status", type: "select", value: "Done" }] });
  assert.ok(version() > before);
  assert.equal(value("Task", "page.Status"), "Done");

  before = version();
  replacePage("Task", { parentPageId: null });
  assert.ok(version() > before);
  assert.equal(value("Task", "PATH"), "/bin");
  assert.equal(value("Task", "page.Status"), null);
});

test("archived, unloaded and second env.json files under one page are not read", () => {
  const pages = usePageStore.getState().pages.w as unknown as Page[];
  setPages([
    ...pages.map((p) => (p._id === "env-project" ? { ...p, archivedAt: "2026-10-28T00:00:00Z" } : p)),
    env("env-sprint-unloaded", "Sprint", { PATH: "unloaded" }, { content: undefined }),
    env("env-root-2", null, { PATH: "second" }),
  ]);
  assert.equal(value("Task", "PATH"), "/bin");
  assert.equal(value("Task", "PROJECT_ONLY"), "no");
});

test("a parentPageId cycle in bad data ends the chain at the first revisit", () => {
  replacePage("Project", { parentPageId: "Task" });
  const placement = variablePlacement("Task");
  assert.deepEqual(placement.pages.map((p) => p._id), ["Task", "Sprint", "Project"]);
  assert.deepEqual(placement.owners.map((o) => o?._id ?? null), ["Project", null]);
  assert.equal(value("Task", "PATH"), "/bin:/project");
});

test("placement is memoised until the page store or env files change", () => {
  const first = variablePlacement("Task");
  assert.equal(variablePlacement("Task"), first);
  replacePage("Task", { title: "T2" });
  assert.notEqual(variablePlacement("Task"), first);
});
