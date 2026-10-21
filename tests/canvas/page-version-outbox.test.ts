/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-version-outbox.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The client saves a page under the content version it last saw: the bridge refuses a
// stale one with a 409 that carries the server's copy, so two writers merge instead of
// erasing each other.
//
// C18: a PATCH answered {ok:true, version:7} leaves the outbox's baseVersion at 7, and
// the NEXT PATCH for that page carries baseVersion: 7.
// C19: the 409's details reach the merge — and a 409 whose shape is not pinned (only a
// top-level version) is a FAILURE, never a guessed conflict.

import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@osionos/http-gate";
import { publishPage } from "@/store/sync/pageOutbox";
import { baseFor, clearBase, setBase } from "@/store/sync/pageBase";
import { bridgeDeps, createBridge, pageEntry, para } from "./page-version.fixtures";

test("C18: a 200 that answers a version advances the base: the next PATCH carries it", async () => {
  const bridge = createBridge({ p1: { version: 4, content: [para("b1", "stored")] } });
  const deps = bridgeDeps(bridge);
  const page = pageEntry("p1", [para("b1", "mine")]);
  // The client read the page at version 4.
  setBase("p1", 4, [para("b1", "stored")]);
  const first = await publishPage(page, deps);
  assert.equal(first.result, "ok", "the write landed");
  assert.equal(first.version, 5, "the answer carries the row's new version");
  assert.equal(baseFor(page).version, 5, "the base advanced to the version the 200 answered");
  // The next PATCH for that page is pinned to it.
  await publishPage(page, deps);
  assert.equal(bridge.patches[1].body.baseVersion, 5);
  clearBase("p1");
});

test("a write that carries no content claims no version: a metadata-only write is not about the content", async () => {
  const bridge = createBridge({ p1: { version: 4, content: [para("b1", "stored")] } });
  const deps = bridgeDeps(bridge);
  const page = pageEntry("p1", [para("b1", "stored")]);
  setBase("p1", 4, [para("b1", "stored")]);
  const meta = { ...page, content: undefined };
  await publishPage(meta, deps);
  assert.equal("baseVersion" in bridge.patches[0].body, false);
  assert.equal("content" in bridge.patches[0].body, false);
  clearBase("p1");
});

test("C19: a 409 that pins its shape is a conflict, and it carries the server's copy", async () => {
  const bridge = createBridge({ p1: { version: 9, content: [para("b1", "theirs")] } });
  const deps = bridgeDeps(bridge);
  const page = pageEntry("p1", [para("b1", "mine")]);
  setBase("p1", 8, [para("b1", "base")]);
  const outcome = await publishPage(page, deps);
  assert.equal(outcome.result, "conflict");
  assert.equal(outcome.version, 9, "the details' version is the conflict's version");
  assert.deepEqual(outcome.conflict?.content, [para("b1", "theirs")]);
  assert.equal(baseFor(page).version, 8, "the base is untouched by the refusal: the merge needs it");
  clearBase("p1");
});

test("C19: a 409 with only a top-level version is a failure — the shape is pinned, never guessed", async () => {
  const bridge = createBridge({ p1: { version: 9, content: [para("b1", "theirs")] } });
  const deps = {
    ...bridgeDeps(bridge),
    patch: async () => {
      // The body the bridge would send with the version at the TOP level: the client
      // reads `details`, so there is nothing to merge with.
      throw new ApiError("This page changed since you loaded it.", 409, "version_conflict");
    },
  };
  const page = pageEntry("p1", [para("b1", "mine")]);
  setBase("p1", 8, [para("b1", "base")]);
  const outcome = await publishPage(page, deps);
  assert.equal(outcome.result, "failed", "a malformed 409 is a failure, not a conflict");
  assert.equal(outcome.conflict, null);
  clearBase("p1");
});
