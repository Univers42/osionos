// A reload restores the account from its persisted bridge-session record, so a workspace created
// or joined in this tab must reach that record or the reload lands on the own private workspace.
// A stored active id the fresh list no longer holds (removed) still falls back to it.

import assert from "node:assert/strict";
import test from "node:test";
import "./support/user-store-env.ts";

const { useUserStore } = await import("../../src/features/auth/model/useUserStore.ts");

const ME = "u1";
const token = () => `osionos_v1.${Buffer.from(JSON.stringify({ sub: ME, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.sig`;
const workspace = (id: string, ownerId = ME) => ({ _id: id, name: id, ownerId, members: [], settings: {} });
const OWN = workspace("ws-own");

function serveWorkspaces(list: unknown[], created?: unknown) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = String(url).endsWith("/api/workspaces") && init?.method === "POST" ? created : list;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function signIn() {
  localStorage.clear();
  useUserStore.setState({ sessions: {}, personas: [], activeUserId: "", activeWorkspaceByUser: {}, initialized: false, loading: false, error: null });
  const session = { userId: ME, accessToken: token(), refreshToken: "osb_rt.one.sig", privateWorkspaces: [OWN], sharedWorkspaces: [] };
  const persona = { id: ME, email: "u1@example.test", password: "", name: ME, emoji: "x", roleBadge: "Member", persistInSessions: true };
  useUserStore.getState().importBridgeSession(session as never, persona as never, new Date(Date.now() + 7 * 864e5).toISOString());
}

async function reload() {
  useUserStore.setState({ sessions: {}, personas: [], activeUserId: "", activeWorkspaceByUser: {}, initialized: false });
  await useUserStore.getState().init();
  return useUserStore.getState().activeWorkspace()?._id;
}

test("a created workspace stays active across a reload", async () => {
  signIn();
  const created = workspace("ws-new");
  serveWorkspaces([OWN, created], created);
  assert.equal((await useUserStore.getState().createWorkspace("ws-new", "ws-new"))?._id, "ws-new");
  assert.equal(await reload(), "ws-new");
});

test("a joined workspace stays active across a reload", async () => {
  signIn();
  serveWorkspaces([OWN, workspace("ws-team", "someone-else")]);
  await useUserStore.getState().refreshWorkspaces(ME);
  useUserStore.getState().switchWorkspace("ws-team");
  assert.equal(await reload(), "ws-team");
});

test("a removed workspace yields to the own private workspace on reload", async () => {
  signIn();
  serveWorkspaces([OWN, workspace("ws-team", "someone-else")]);
  await useUserStore.getState().refreshWorkspaces(ME);
  useUserStore.getState().switchWorkspace("ws-team");
  serveWorkspaces([OWN]);
  await useUserStore.getState().refreshWorkspaces(ME);
  assert.equal(await reload(), "ws-own");
});
