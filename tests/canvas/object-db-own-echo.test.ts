/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   object-db-own-echo.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A tab's own push comes back as an `objectdb_changed` nudge. Re-hydrating on it
// re-downloads every database of the account (2.7 MiB for the largest live one)
// to learn nothing, so the nudge carries the pushing tab's id and that tab skips it.

import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import { objectDatabasePushBody } from "../../src/widgets/database-view/model/objectDatabaseBridgeSync";
import {
  OBJECT_DB_WRITER_ID,
  isOwnObjectDbWrite,
  objectDbNudgeHandler,
  stopObjectDatabaseRealtime,
} from "../../src/widgets/database-view/model/objectDatabaseRealtime";
import type { NotionState } from "../../src/shared/notion-database-sys/packages/contract-types/src/index.ts";

const nudge = (payload: unknown, eventType = "objectdb_changed") => ({
  event_id: "e1",
  topic: "objectdb:u1",
  event_type: eventType,
  sequence: 1,
  timestamp: "2026-10-26T00:00:00.000Z",
  payload,
});

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => {
  stopObjectDatabaseRealtime();
  mock.timers.reset();
});

test("every push names the tab that made it", () => {
  const body = objectDatabasePushBody("db-1", "Catalog", {} as NotionState);
  assert.equal(body.origin, OBJECT_DB_WRITER_ID);
  assert.match(OBJECT_DB_WRITER_ID, /^[0-9a-f]{24}$/);
});

test("only a nudge carrying this tab's id is its own", () => {
  assert.equal(isOwnObjectDbWrite({ dbKey: "db-1", origin: OBJECT_DB_WRITER_ID }), true);
  assert.equal(isOwnObjectDbWrite({ dbKey: "db-1", origin: "another-tab" }), false);
  assert.equal(isOwnObjectDbWrite({ dbKey: "db-1" }), false, "an older bridge sends no id: refetch as before");
  assert.equal(isOwnObjectDbWrite(null), false);
  assert.equal(isOwnObjectDbWrite(OBJECT_DB_WRITER_ID), false);
});

test("the tab's own write does not re-hydrate", () => {
  const rehydrate = mock.fn();
  const onEvent = objectDbNudgeHandler(rehydrate);
  onEvent(nudge({ dbKey: "db-1", origin: OBJECT_DB_WRITER_ID }));
  mock.timers.tick(1000);
  assert.equal(rehydrate.mock.callCount(), 0);
});

test("another tab's write re-hydrates once per burst", () => {
  const rehydrate = mock.fn();
  const onEvent = objectDbNudgeHandler(rehydrate);
  onEvent(nudge({ dbKey: "db-1", origin: OBJECT_DB_WRITER_ID }));
  onEvent(nudge({ dbKey: "db-1", origin: "another-tab" }));
  onEvent(nudge({ dbKey: "db-2" }));
  mock.timers.tick(299);
  assert.equal(rehydrate.mock.callCount(), 0);
  mock.timers.tick(1);
  assert.equal(rehydrate.mock.callCount(), 1);
  onEvent(nudge({ dbKey: "db-3", origin: "another-tab" }));
  mock.timers.tick(300);
  assert.equal(rehydrate.mock.callCount(), 2);
});

test("other event types are ignored", () => {
  const rehydrate = mock.fn();
  objectDbNudgeHandler(rehydrate)(nudge({ dbKey: "db-1" }, "message_created"));
  mock.timers.tick(1000);
  assert.equal(rehydrate.mock.callCount(), 0);
});
