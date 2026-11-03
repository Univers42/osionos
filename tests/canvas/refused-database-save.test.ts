// A database save the server refuses is told to the user once per content version (#281):
// before, the refusal was swallowed and the edits lived only in that browser.

import assert from "node:assert/strict";
import test from "node:test";

import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import { clearRefusedDatabaseSave, noticeRefusedDatabaseSave } from "../../src/widgets/database-view/model/refusedDatabaseSave.ts";

const toasts = () => useToastStore.getState().toasts;

test("a WAF 403 toasts once for the same content, again for new content", () => {
  useToastStore.getState().clear();
  assert.equal(noticeRefusedDatabaseSave("db-1", "Tasks", "h1", 403), true);
  assert.equal(noticeRefusedDatabaseSave("db-1", "Tasks", "h1", 403), false);
  assert.equal(toasts().length, 1);
  assert.equal(toasts()[0].kind, "error");
  assert.match(toasts()[0].title, /Tasks.*not saved/);
  assert.match(toasts()[0].description ?? "", /kept in this browser/);
  assert.equal(noticeRefusedDatabaseSave("db-1", "Tasks", "h2", 403), true);
  assert.equal(toasts().length, 2);
});

test("a save that goes through re-arms the warning", () => {
  useToastStore.getState().clear();
  assert.equal(noticeRefusedDatabaseSave("db-2", "Notes", "h1", 413), true);
  clearRefusedDatabaseSave("db-2");
  assert.equal(noticeRefusedDatabaseSave("db-2", "Notes", "h1", 413), true);
  assert.match(toasts()[1].description ?? "", /larger than the server accepts/);
});

test("passing failures stay silent: they clear up on the next flush", () => {
  useToastStore.getState().clear();
  for (const status of [undefined, 401, 408, 409, 429, 500, 502, 503]) {
    assert.equal(noticeRefusedDatabaseSave(`db-${status}`, "X", "h", status), false, String(status));
  }
  assert.equal(toasts().length, 0);
});

test("an untitled database is still named", () => {
  useToastStore.getState().clear();
  noticeRefusedDatabaseSave("db-3", "", "h", 422);
  assert.match(toasts()[0].title, /Untitled database/);
});
