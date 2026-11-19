/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cover-drag-publishes.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// groot ADR 0065 CV2/CV3: a saved cover reposition is an edit like a title edit. coverPosition is
// outside the stamp, so it reaches the server only through the updatedAt bump; before this the
// drag called patchPage alone and the position stayed on the device until some other edit.
// The hooks run under renderToStaticMarkup only to capture the callbacks the header wires up.

import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import "./support/user-store-env.ts";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");
const { PAGE_OUTBOX_KEY, buildDesiredPages, pageStamp, saveOutboxLedger } =
  await import("../../src/store/sync/pageStamp.ts");
const { computeSyncActions, loadLedger } = await import("../../packages/outbox-ledger/src/index.ts");
const { publishPage } = await import("../../src/store/sync/pageOutbox.ts");
const { usePageHeaderActions } = await import("../../src/pages/notion-page/ui/usePageHeaderActions.ts");
const { useCoverReposition } = await import("../../src/entities/page/ui/useCoverReposition.ts");
const { bridgeDeps, createBridge } = await import("./page-version.fixtures.ts");

const P = "5b0c9a52-3f1e-4c7a-9d42-6a1f0e2b7c11";
const OWNER = "owner";
const ownerSession = { userId: OWNER, privateWorkspaces: [{ _id: "ws" }], sharedWorkspaces: [] };
Reflect.set(globalThis, "__playgroundUserStore", { getState: () => ({ activeSession: () => ownerSession }) });

/** A published, clean page with a positioned cover: the ledger holds its stamp. */
function seedPublished(): PageEntry {
  const page = {
    _id: P, workspaceId: "ws", ownerId: OWNER, title: "Cover", content: [],
    cover: "linear-gradient(red, blue)", coverPosition: 50, updatedAt: "2026-10-01T10:00:00.000Z",
  } as PageEntry;
  localStorage.clear();
  usePageStore.setState({ ...derivePageState({ ws: [page] }), pageRevisions: {} });
  saveOutboxLedger(PAGE_OUTBOX_KEY, { [P]: pageStamp(page) });
  return page;
}

function capture<T>(useHook: () => T): T {
  let captured: T | undefined;
  function Probe() {
    captured = useHook();
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  assert.ok(captured, "the hook rendered");
  return captured;
}

const current = () => usePageStore.getState().pageById(P)!;
const pending = () =>
  computeSyncActions(buildDesiredPages(usePageStore.getState().pages).desired, loadLedger(PAGE_OUTBOX_KEY)).toPublish;

test("CV3: a saved reposition changes the stamp, the outbox lists the page and the PATCH carries it", async () => {
  const before = seedPublished();
  assert.deepEqual(pending(), [], "a clean page publishes nothing");
  capture(() => usePageHeaderActions(P, false)).changeCoverPosition(20);
  const after = current();
  assert.equal(after.coverPosition, 20);
  assert.notEqual(after.updatedAt, before.updatedAt, "the drag is timestamped like a title edit");
  assert.notEqual(pageStamp(after), pageStamp(before));
  assert.deepEqual(pending(), [P]);
  const bridge = createBridge({ [P]: { version: 1, content: [] } });
  assert.equal((await publishPage(after, bridgeDeps(bridge))).result, "ok");
  assert.equal(bridge.patches[0].body.coverPosition, 20);
});

test("CV3: a cancel, or a save at the same value, leaves updatedAt and the stamp unchanged", () => {
  const before = seedPublished();
  const repos = capture(() => {
    const actions = usePageHeaderActions(P, false);
    return useCoverReposition(before.coverPosition!, actions.changeCoverPosition);
  });
  repos.start();
  repos.cancel();
  repos.start();
  repos.save();
  capture(() => usePageHeaderActions(P, false)).changeCoverPosition(50);
  assert.equal(current().updatedAt, before.updatedAt);
  assert.equal(pageStamp(current()), pageStamp(before));
  assert.deepEqual(pending(), []);
});
