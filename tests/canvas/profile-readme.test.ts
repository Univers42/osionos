/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   profile-readme.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The README flow of the profile page: which workspace holds it, the lazy
// create-then-link sequence behind "Customize", and the ?u= deep-link reader.
// Pure modules only: the network and the page store are injected.

import assert from "node:assert/strict";
import test from "node:test";

const { pickReadmeWorkspace, customizeReadme, openLinkedById } = await import("../../src/widgets/profile-page/model/readmeCustomize.ts");
const { readProfileLinkUsername } = await import("../../src/widgets/profile-page/model/profileLinkParam.ts");

const ME = "user-me";
const PAGE_ID = "11111111-1111-4111-8111-111111111111";
const mine = (id: string) => ({ _id: id, ownerId: ME });
const theirs = (id: string) => ({ _id: id, ownerId: "user-other" });

test("pickReadmeWorkspace: the active workspace when the user owns it", () => {
  assert.equal(pickReadmeWorkspace(ME, "ws-b", [mine("ws-a"), mine("ws-b")]), "ws-b");
});

test("pickReadmeWorkspace: the first owned one when the active workspace is someone else's", () => {
  assert.equal(pickReadmeWorkspace(ME, "ws-shared", [theirs("ws-shared"), mine("ws-a"), mine("ws-b")]), "ws-a");
});

test("pickReadmeWorkspace: null when the user owns nothing", () => {
  assert.equal(pickReadmeWorkspace(ME, "ws-shared", [theirs("ws-shared")]), null);
  assert.equal(pickReadmeWorkspace(ME, "", []), null);
});

const profile = (readmePageId: string | null, version = 3) => ({ ok: true as const, version, profile: { readmePageId, version } });

function setup(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const base = {
    loadProfile: async () => { calls.push("load"); return profile(null); },
    saveProfile: async (patch: unknown, version: number) => {
      calls.push(`save ${JSON.stringify(patch)} @${version}`);
      return profile(PAGE_ID, version + 1);
    },
    openLinked: async () => ({ status: "error" }),
    createPage: async (workspaceId: string) => {
      calls.push(`create ${workspaceId}`);
      return { _id: PAGE_ID, workspaceId, title: "README" };
    },
    ...overrides,
  };
  return { calls, deps: base as never };
}

test("customizeReadme: first click creates the page in the chosen workspace, then links it", async () => {
  const { calls, deps } = setup();
  const result = await customizeReadme(deps, "ws-a");
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["load", "create ws-a", `save {"readmePageId":"${PAGE_ID}"} @3`]);
});

const LINKED = { _id: PAGE_ID, workspaceId: "ws-a", title: "README" };

test("customizeReadme: a linked id is opened by id (loaded or not) and never created again", async () => {
  const opened: string[] = [];
  const { calls, deps } = setup({
    loadProfile: async () => profile(PAGE_ID),
    openLinked: async (id: string) => { opened.push(id); return { status: "found", page: LINKED }; },
  });
  const result = await customizeReadme(deps, "ws-a");
  assert.deepEqual(result, { ok: true, page: LINKED });
  assert.deepEqual(opened, [PAGE_ID]);
  assert.deepEqual(calls, []);
});

test("customizeReadme: a linked id that is gone creates nothing and asks first", async () => {
  const { calls, deps } = setup({ loadProfile: async () => profile(PAGE_ID), openLinked: async () => ({ status: "gone" }) });
  const result = await customizeReadme(deps, "ws-a");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.linkedGone, true);
  assert.deepEqual(calls, []);
});

test("customizeReadme: a failed open of the linked id replaces nothing", async () => {
  const { calls, deps } = setup({ loadProfile: async () => profile(PAGE_ID), openLinked: async () => ({ status: "error" }) });
  const result = await customizeReadme(deps, "ws-a");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.linkedGone, undefined);
  assert.deepEqual(calls, []);
});

test("customizeReadme: after the explicit button, the gone link is replaced", async () => {
  const { calls, deps } = setup({ loadProfile: async () => profile(PAGE_ID), openLinked: async () => ({ status: "gone" }) });
  const result = await customizeReadme(deps, "ws-a", true);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["create ws-a", `save {"readmePageId":"${PAGE_ID}"} @3`]);
});

test("customizeReadme: no owned workspace creates nothing", async () => {
  const { calls, deps } = setup();
  const result = await customizeReadme(deps, null);
  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["load"]);
});

test("customizeReadme: an unavailable account plane creates nothing", async () => {
  const { calls, deps } = setup({ loadProfile: async () => ({ ok: false, reason: "unavailable" }) });
  const result = await customizeReadme(deps, "ws-a");
  assert.equal(result.ok, false);
  assert.deepEqual(calls, []);
});

test("customizeReadme: one 412 is retried with the server's version", async () => {
  const versions: number[] = [];
  const { deps } = setup({
    saveProfile: async (_patch: unknown, version: number) => {
      versions.push(version);
      return versions.length === 1 ? { ok: false, reason: "conflict", profile: null, version: 9 } : profile(PAGE_ID, version + 1);
    },
  });
  const result = await customizeReadme(deps, "ws-a");
  assert.equal(result.ok, true);
  assert.deepEqual(versions, [3, 9]);
});

test("customizeReadme: a link that keeps failing is reported, not swallowed", async () => {
  const { deps } = setup({ saveProfile: async () => ({ ok: false, reason: "failed", message: "boom" }) });
  const result = await customizeReadme(deps, "ws-a");
  assert.equal(result.ok, false);
});

test("readProfileLinkUsername: a valid username, nothing else", () => {
  assert.equal(readProfileLinkUsername("?u=bob"), "bob");
  assert.equal(readProfileLinkUsername("?x=1&u=ada.l-1"), "ada.l-1");
  const hostile = ["", "?u=", "?u=a", "?u=../etc", "?u=bob%2F..", "?u=%3Cscript%3E", `?u=${"a".repeat(40)}`, "?view=profile"];
  for (const search of hostile) assert.equal(readProfileLinkUsername(search), null, search);
});

// openLinkedById: the store alone cannot render a README that lives in a workspace that was never pulled.
function linkedIo(overrides: Record<string, unknown> = {}) {
  const log: string[] = [];
  let pulled = false;
  const stored = { _id: PAGE_ID, workspaceId: "ws-far", title: "README" };
  const io = {
    readStore: () => (pulled ? stored : undefined),
    fetchPage: async () => { log.push("fetch"); return { ...stored }; },
    pullWorkspace: async (workspaceId: string) => { log.push(`pull ${workspaceId}`); pulled = true; },
    isNotFound: () => false,
    ...overrides,
  };
  return { log, stored, io: io as never };
}

test("openLinkedById: a page in the store opens without any request", async () => {
  const { log, stored, io } = linkedIo({ readStore: () => ({ _id: PAGE_ID, workspaceId: "ws-a", title: "README" }) });
  const result = await openLinkedById(PAGE_ID, io);
  assert.equal(result.status, "found");
  assert.deepEqual(log, []);
  assert.notEqual(stored, undefined);
});

test("openLinkedById: a fetched page is pulled into the store and the store entry is returned", async () => {
  const { log, stored, io } = linkedIo();
  const result = await openLinkedById(PAGE_ID, io);
  assert.deepEqual(result, { status: "found", page: stored });
  assert.deepEqual(log, ["fetch", "pull ws-far"]);
});

test("openLinkedById: still absent after the pull is an error, never gone", async () => {
  const { io } = linkedIo({ pullWorkspace: async () => undefined });
  assert.deepEqual(await openLinkedById(PAGE_ID, io), { status: "error" });
});

test("openLinkedById: 404 and archived are gone; other failures are errors", async () => {
  const notFound = new Error("404");
  const gone404 = linkedIo({ fetchPage: async () => { throw notFound; }, isNotFound: (error: unknown) => error === notFound });
  assert.deepEqual(await openLinkedById(PAGE_ID, gone404.io), { status: "gone" });
  const archived = linkedIo({ fetchPage: async () => ({ _id: PAGE_ID, workspaceId: "ws-far", archivedAt: "2026-01-01" }) });
  assert.deepEqual(await openLinkedById(PAGE_ID, archived.io), { status: "gone" });
  const boom = linkedIo({ fetchPage: async () => { throw new Error("500"); } });
  assert.deepEqual(await openLinkedById(PAGE_ID, boom.io), { status: "error" });
});
