/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-rename-refused.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #158: a rename the bridge refused stayed on screen — the PATCH's rejection was swallowed —
// so the owner believed the organization renamed while the members and the next load kept the old name.

import assert from "node:assert/strict";
import test from "node:test";
import "./support/user-store-env.ts";
import { withBridge } from "./support/stub-bridge.ts";

const { useUserStore } = await import("../../src/features/auth/model/useUserStore.ts");
const { useToastStore } = await import("../../packages/osionos-ui/src/primitives/useToastStore.ts");

const token = `osionos_v1.${Buffer.from(JSON.stringify({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;

function signIn() {
  const acme = { _id: "a", name: "Acme", ownerId: "u1", members: [], settings: {} };
  useUserStore.setState({
    sessions: { u1: { userId: "u1", accessToken: token, refreshToken: "", privateWorkspaces: [acme], sharedWorkspaces: [] } as never },
    activeUserId: "u1", activeWorkspaceByUser: { u1: "a" }, error: null,
  });
  useToastStore.setState({ toasts: [] });
}
const shownName = () => useUserStore.getState().sessions.u1.privateWorkspaces[0].name;

test("a refused rename goes back to the stored name and says why", async () => {
  signIn();
  const calls = await withBridge(() => ({ status: 422, body: { ok: false, message: "name cannot be empty." } }), async () => {
    await useUserStore.getState().renameWorkspace("a", "Acme Labs");
  });
  assert.deepEqual(calls.map((call) => [call.method, call.url, call.body]), [["PATCH", "https://bridge.test/api/workspaces/a", { name: "Acme Labs" }]]);
  assert.equal(shownName(), "Acme");
  const [toast] = useToastStore.getState().toasts;
  assert.equal(toast?.kind, "error");
  assert.equal(toast?.description, "name cannot be empty.");
});

test("an accepted rename stays, with nothing to report", async () => {
  signIn();
  await withBridge(() => ({ body: { ok: true } }), async () => {
    await useUserStore.getState().renameWorkspace("a", "Acme Labs");
  });
  assert.equal(shownName(), "Acme Labs");
  assert.deepEqual(useToastStore.getState().toasts, []);
});

test("a later rename is not undone by an earlier one's refusal", async () => {
  signIn();
  await withBridge((call) => (call.body?.name === "Acme Labs" ? { status: 503, body: { ok: false } } : { body: { ok: true } }), async () => {
    const first = useUserStore.getState().renameWorkspace("a", "Acme Labs");
    const second = useUserStore.getState().renameWorkspace("a", "Acme Group");
    await Promise.all([first, second]);
  });
  assert.equal(shownName(), "Acme Group");
});
