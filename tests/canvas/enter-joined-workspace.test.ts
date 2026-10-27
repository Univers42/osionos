/**
 * Accepting an invite lands the user in the joined workspace, after the list is reloaded.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { enterJoinedWorkspace } from "../../src/features/settings/people/enterJoinedWorkspace.ts";

test("refreshes the workspace list before switching to the joined workspace", async () => {
  const calls: string[] = [];
  await enterJoinedWorkspace("ws-new", {
    refreshWorkspaces: async () => { calls.push("refresh"); },
    switchWorkspace: (id) => { calls.push(`switch:${id}`); },
  });
  assert.deepEqual(calls, ["refresh", "switch:ws-new"]);
});

test("still switches when the refresh fails", async () => {
  const calls: string[] = [];
  await enterJoinedWorkspace("ws-new", {
    refreshWorkspaces: () => Promise.reject(new Error("offline")),
    switchWorkspace: (id) => { calls.push(id); },
  });
  assert.deepEqual(calls, ["ws-new"]);
});
