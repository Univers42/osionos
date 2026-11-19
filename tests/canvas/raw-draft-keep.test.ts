/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   raw-draft-keep.test.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Raw mode's unsaved text survives a reload of the tab (a stale-chunk reload, ADR 0061) in
// sessionStorage, one key per user and page. Storage that is missing, whose getter throws
// (Firefox with cookies blocked) or that refuses the write never throws into raw mode.

import assert from "node:assert/strict";
import test from "node:test";

import { dropRawDraft, keepRawDraft, rawDraftKey, readRawDraft } from "../../src/features/raw-mode/model/rawDraftKeep.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

test("a kept draft reads back for its own page only, and is gone once dropped", () => {
  const storage = memoryStorage();
  const source = () => storage;
  const mine = rawDraftKey("user-1:page-1");
  keepRawDraft(mine, "::: grid {cols=3}\nunsaved\n:::", source);
  assert.equal(readRawDraft(mine, source), "::: grid {cols=3}\nunsaved\n:::");
  assert.equal(readRawDraft(rawDraftKey("user-1:page-2"), source), null);
  assert.equal(readRawDraft(rawDraftKey("user-2:page-1"), source), null);
  dropRawDraft(mine, source);
  assert.equal(readRawDraft(mine, source), null);
  assert.equal(storage.values.size, 0);
});

test("an empty draft is kept as empty text, not as no draft", () => {
  const storage = memoryStorage();
  keepRawDraft(rawDraftKey("u:p"), "", () => storage);
  assert.equal(readRawDraft(rawDraftKey("u:p"), () => storage), "");
});

test("a missing storage, a throwing getter or a refused write never throws", () => {
  const throwingGetter = () => { throw new DOMException("The operation is insecure.", "SecurityError"); };
  const refusing = () => ({
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
    removeItem: () => { throw new Error("denied"); },
  });
  for (const source of [() => undefined, throwingGetter, refusing]) {
    assert.doesNotThrow(() => keepRawDraft(rawDraftKey("u:p"), "text", source));
    assert.equal(readRawDraft(rawDraftKey("u:p"), source), null);
    assert.doesNotThrow(() => dropRawDraft(rawDraftKey("u:p"), source));
  }
});

// sessionStorage comes back with a reopened tab (Ctrl+Shift+T) and a restored browser session;
// the case kept for is a reload seconds later, so anything older than 10 minutes is not a draft.
test("a draft is restored within 10 minutes of being kept, never after", () => {
  const storage = memoryStorage();
  const source = () => storage;
  const keptAt = 1_800_000_000_000;
  const tenMinutes = 10 * 60_000;
  keepRawDraft(rawDraftKey("u:p"), "recent", source, keptAt);
  assert.equal(readRawDraft(rawDraftKey("u:p"), source, keptAt + 2_000), "recent");
  assert.equal(readRawDraft(rawDraftKey("u:p"), source, keptAt + tenMinutes), "recent");
  assert.equal(readRawDraft(rawDraftKey("u:p"), source, keptAt + tenMinutes + 1), null);
  assert.equal(readRawDraft(rawDraftKey("u:p"), source, keptAt + 3 * 24 * 3_600_000), null);
  // A clock set back between keep and read makes the age unknowable.
  assert.equal(readRawDraft(rawDraftKey("u:p"), source, keptAt - 1), null);
});

test("a stored value that is not a kept draft reads as no draft", () => {
  const storage = memoryStorage();
  const source = () => storage;
  for (const value of ["plain text from an older build", "{", "null", '{"text":1,"savedAt":0}', '{"text":"x"}']) {
    storage.values.set(rawDraftKey("u:p"), value);
    assert.equal(readRawDraft(rawDraftKey("u:p"), source), null, value);
  }
});
