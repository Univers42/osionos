/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   stub-bridge.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-5-b: the settings UI of workspace delete / leave / transfer. The store is the real one
// against a stubbed bridge; the React panels have no render harness here, so their wiring is
// pinned as source text (the same convention as the other settings canvas tests).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "./support/user-store-env.ts";
import { withBridge } from "./support/stub-bridge.ts";

const { useUserStore } = await import("../../src/features/auth/model/useUserStore.ts");
const { isWorkspaceOwner } = await import("../../src/features/settings/model/workspaceOwnership.ts");

const read = (path: string) => readFileSync(new URL(`../../src/features/settings/${path}`, import.meta.url), "utf8");
const token = `osionos_v1.${Buffer.from(JSON.stringify({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;
const ws = (id: string, ownerId = "u1") => ({ _id: id, name: id, ownerId, members: [], settings: {} }) as never;

function signIn(workspaces: unknown[]) {
  useUserStore.setState({
    sessions: { u1: { userId: "u1", accessToken: token, refreshToken: "", privateWorkspaces: workspaces, sharedWorkspaces: [] } as never },
    activeUserId: "u1", activeWorkspaceByUser: { u1: "a" }, error: null,
  });
}
const ids = () => useUserStore.getState().sessions.u1.privateWorkspaces.map((w) => w._id);

test("a refused delete (sudo_required) keeps the workspace and reports why", async () => {
  signIn([ws("a"), ws("b")]);
  let result: boolean | undefined;
  const calls = await withBridge(() => ({ status: 403, body: { ok: false, code: "sudo_required", message: "Confirm it is you first." } }), async () => {
    result = await useUserStore.getState().deleteWorkspace("a");
  });
  assert.equal(result, false);
  assert.deepEqual(ids(), ["a", "b"]);
  assert.equal(useUserStore.getState().error, "Confirm it is you first.");
  assert.deepEqual(calls.map((c) => c.method), ["DELETE"]);
});

test("an accepted delete drops the workspace locally; the last workspace is never sent", async () => {
  signIn([ws("a"), ws("b")]);
  let result: boolean | undefined;
  await withBridge(() => ({ body: { ok: true } }), async () => { result = await useUserStore.getState().deleteWorkspace("a"); });
  assert.equal(result, true);
  assert.deepEqual(ids(), ["b"]);
  const calls = await withBridge(() => ({ body: { ok: true } }), async () => { result = await useUserStore.getState().deleteWorkspace("b"); });
  assert.equal(result, false);
  assert.equal(calls.length, 0);
});

test("only the owner counts as owner", () => {
  assert.equal(isWorkspaceOwner({ ownerId: "u1" } as never, "u1"), true);
  assert.equal(isWorkspaceOwner({ ownerId: "u2", role: "owner" } as never, "u1"), true);
  assert.equal(isWorkspaceOwner({ ownerId: "u2", role: "admin" } as never, "u1"), false);
  assert.equal(isWorkspaceOwner(undefined, "u1"), false);
});

test("the General panel offers Delete to the owner and Leave to everyone else, and toasts success only after it", () => {
  const panel = read("general/GeneralPanel.tsx");
  assert.match(panel, /isOwner \? \(?\s*<SettingRow danger title="Delete workspace"/);
  assert.match(panel, /title="Leave workspace"/);
  assert.match(panel, /runAccountAction\(`\/api\/workspaces\/\$\{workspaceId\}\/leave`/);
  const handler = panel.slice(panel.indexOf("async function handleDeleteWorkspace"));
  assert.ok(handler.indexOf("if (!deleted) throw") < handler.indexOf("title: 'Workspace scheduled"));
  assert.match(handler, /useUserStore\.getState\(\)\.error/);
});

test("People peek offers Transfer ownership to the owner only, behind a typed confirm, and surfaces a failed transfer", () => {
  const peek = read("people/PeoplePeek.tsx");
  assert.match(peek, /isViewerOwner && page.id !== viewerId/);
  assert.match(peek, /<TypedConfirmModal title="Transfer ownership"/);
  assert.doesNotMatch(peek, /<ConfirmButton label="Transfer ownership"/);
  const actions = read("people/peopleActions.ts");
  assert.match(actions, /throw new Error\(/);
  assert.match(actions, /Could not transfer ownership/);
});
