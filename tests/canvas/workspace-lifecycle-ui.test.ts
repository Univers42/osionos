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
const { isWorkspaceOwner, pendingDeleteFor } = await import("../../src/features/settings/model/workspaceOwnership.ts");
const { canRetryAfterSudo, useSudoPromptStore } = await import("../../src/features/settings/ui/sudo/sudoPromptModel.ts");
const { cancelWorkspaceDelete } = await import("../../src/features/settings/model/settingsCalls.ts");
const { useWorkspaceMembersStore } = await import("../../src/store/settings/useWorkspaceMembersStore.ts");
const { transferOwnership } = await import("../../src/features/settings/people/peopleActions.ts");

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
  let result: { ok: boolean; code?: string } | undefined;
  const calls = await withBridge(() => ({ status: 403, body: { ok: false, code: "sudo_required", message: "Confirm it is you first." } }), async () => {
    result = await useUserStore.getState().deleteWorkspace("a");
  });
  assert.equal(result?.ok, false);
  assert.equal(result?.code, "sudo_required");
  assert.deepEqual(ids(), ["a", "b"]);
  assert.equal(useUserStore.getState().error, null, "a sudo refusal is not an error text");
  assert.deepEqual(calls.map((c) => c.method), ["DELETE"]);
});

test("a refused (not sudo) delete keeps the workspace and reports why", async () => {
  signIn([ws("a"), ws("b")]);
  let result: { ok: boolean; code?: string; message?: string } | undefined;
  await withBridge(() => ({ status: 409, body: { ok: false, code: "last_workspace", message: "Create another workspace before deleting your last one." } }), async () => {
    result = await useUserStore.getState().deleteWorkspace("a");
  });
  assert.equal(result?.code, "last_workspace");
  assert.equal(useUserStore.getState().error, "Create another workspace before deleting your last one.");
  assert.deepEqual(ids(), ["a", "b"]);
});

test("sudo seam: delete refused once, a grant re-enables Try again, the second call goes through", async () => {
  signIn([ws("a"), ws("b")]);
  let refused = true;
  const reply = () => (refused ? { status: 403, body: { ok: false, code: "sudo_required", message: "Confirm it is you first." } } : { body: { ok: true } });
  let first: { ok: boolean; code?: string } | undefined;
  let second: { ok: boolean } | undefined;
  const grantsAtRefusal = useSudoPromptStore.getState().grants;
  const calls = await withBridge(reply, async () => {
    first = await useUserStore.getState().deleteWorkspace("a");
    assert.equal(canRetryAfterSudo(first.code === "sudo_required", useSudoPromptStore.getState().grants, grantsAtRefusal), false);
    useSudoPromptStore.getState().granted();
    assert.equal(canRetryAfterSudo(true, useSudoPromptStore.getState().grants, grantsAtRefusal), true);
    refused = false;
    second = await useUserStore.getState().deleteWorkspace("a");
  });
  assert.equal(first?.code, "sudo_required");
  assert.equal(second?.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(ids(), ["b"]);
});

test("an accepted delete drops the workspace locally; the last workspace is never sent", async () => {
  signIn([ws("a"), ws("b")]);
  let result: { ok: boolean } | undefined;
  await withBridge(() => ({ body: { ok: true } }), async () => { result = await useUserStore.getState().deleteWorkspace("a"); });
  assert.equal(result?.ok, true);
  assert.deepEqual(ids(), ["b"]);
  const calls = await withBridge(() => ({ body: { ok: true } }), async () => { result = await useUserStore.getState().deleteWorkspace("b"); });
  assert.equal(result?.ok, false);
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
  assert.match(handler, /code: outcome\.code/);
});

test("People peek offers Transfer ownership to the owner only, behind a typed confirm, and surfaces a failed transfer", () => {
  const peek = read("people/PeoplePeek.tsx");
  assert.match(peek, /isViewerOwner && page.id !== viewerId/);
  assert.match(peek, /<TypedConfirmModal title="Transfer ownership"/);
  assert.doesNotMatch(peek, /<ConfirmButton label="Transfer ownership"/);
  const actions = read("people/peopleActions.ts");
  assert.match(actions, /throw Object\.assign\(new Error\(/);
  assert.match(actions, /Could not transfer ownership/);
});

test("sudo seam: a refused transfer reverts the roster, raises no error toast, and carries the code", async () => {
  const members = [
    { _id: "m1", workspaceId: "w1", userId: "u1", role: "owner" },
    { _id: "m2", workspaceId: "w1", userId: "u2", role: "member" },
  ] as never;
  useWorkspaceMembersStore.setState({ data: { w1: members }, error: {}, errorCode: {} });
  let refused = true;
  const reply = () => (refused ? { status: 403, body: { ok: false, code: "sudo_required", message: "Confirm it is you first." } } : { body: { ok: true, members: [{ userId: "u1", role: "admin" }, { userId: "u2", role: "owner" }] } });
  const { useToastStore } = await import("../../packages/osionos-ui/src/primitives/useToastStore.ts");
  const toasts: unknown[] = [];
  const unsubscribe = useToastStore.subscribe((state, previous) => { if (state.toasts.length > previous.toasts.length) toasts.push(state.toasts.at(-1)); });
  const grantsAtRefusal = useSudoPromptStore.getState().grants;
  let failure: { code?: string } | undefined;
  await withBridge(reply, async () => {
    await transferOwnership("w1", "u2").catch((error) => { failure = error; });
  });
  assert.equal(failure?.code, "sudo_required");
  assert.deepEqual(useWorkspaceMembersStore.getState().data.w1.map((m) => m.role), ["owner", "member"], "the roster stays reverted");
  assert.equal(useWorkspaceMembersStore.getState().error.w1, null);
  assert.equal(toasts.length, 0, "no error toast on sudo");
  assert.equal(canRetryAfterSudo(true, useSudoPromptStore.getState().grants, grantsAtRefusal), false);
  useSudoPromptStore.getState().granted();
  assert.equal(canRetryAfterSudo(true, useSudoPromptStore.getState().grants, grantsAtRefusal), true);
  refused = false;
  const calls = await withBridge(reply, async () => { await transferOwnership("w1", "u2"); });
  unsubscribe();
  assert.deepEqual(calls.map((c) => c.method), ["POST"]);
  assert.deepEqual(useWorkspaceMembersStore.getState().data.w1.map((m) => m.role), ["admin", "owner"]);
});

test("a staged delete shows the owner a banner with its date; a click posts to /cancel-delete", async () => {
  const staged = { ownerId: "u1", pendingDeleteAt: "2026-10-23T00:00:00.000Z", deleteAfter: "2026-11-06T00:00:00.000Z" };
  assert.equal(pendingDeleteFor(staged as never, "u1"), "2026-11-06T00:00:00.000Z");
  assert.equal(pendingDeleteFor({ ...staged, ownerId: "u2" } as never, "u1"), null, "members see no cancel");
  assert.equal(pendingDeleteFor({ ownerId: "u1" } as never, "u1"), null, "nothing staged, no banner");
  const panel = read("general/GeneralPanel.tsx");
  assert.match(panel, /pendingDeleteAfter !== null && <PendingDeleteBanner/);
  const banner = read("general/PendingDeleteBanner.tsx");
  assert.match(banner, /Scheduled for deletion on \{when\}/);
  const calls = await withBridge(() => ({ body: { ok: true, cancelled: true } }), async () => { await cancelWorkspaceDelete("w1"); });
  assert.deepEqual(calls.map((c) => [c.method, new URL(c.url).pathname]), [["POST", "/api/workspaces/w1/cancel-delete"]]);
});

test("the sudo prompt stacks above the confirm dialogs: it mounts later, into the same portal root", () => {
  const modal = readFileSync(new URL("../../packages/osionos-ui/src/primitives/Modal.tsx", import.meta.url), "utf8");
  assert.match(modal, /if \(!open \|\| typeof document === "undefined"\) return null/);
  assert.match(modal, /createPortal\([\s\S]*document\.body,\s*\)/);
  const confirms = read("ui/ConfirmModals.tsx");
  assert.doesNotMatch(confirms, /z-\[|zIndex|z-index/, "a confirm dialog must not claim a higher layer than the prompt");
  const prompt = read("ui/sudo/SudoPrompt.tsx");
  assert.match(prompt, /<Modal\b/);
  assert.doesNotMatch(prompt, /z-\[|zIndex|z-index/);
  const view = read("ui/SettingsView.tsx");
  assert.match(view, /<SudoPrompt\s*\/>/);
});
