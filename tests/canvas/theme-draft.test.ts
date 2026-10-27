/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme-draft.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import { mock } from "node:test";

import "./support/memory-local-storage.ts";

const sessionStore = new Map<string, string>();
const sessionStorageStub = {
  getItem: (key: string) => sessionStore.get(key) ?? null,
  setItem: (key: string, value: string) => void sessionStore.set(key, String(value)),
  removeItem: (key: string) => void sessionStore.delete(key),
  clear: () => sessionStore.clear(),
  key: (index: number) => [...sessionStore.keys()][index] ?? null,
  get length() { return sessionStore.size; },
};
Object.assign(globalThis, { sessionStorage: sessionStorageStub, window: globalThis });

const { createJsonDraft } = await import("../../src/features/theme-editor/model/useJsonDraft.ts");

function makeConfig(overrides: Partial<any> = {}) {
  const preview = overrides.preview ?? (() => undefined);
  const restore = overrides.restore ?? (() => undefined);
  const save = overrides.save ?? (() => ({ ok: true }));
  const initialText = overrides.initialText ?? (() => '{"name":"A"}');
  const parse = overrides.parse ?? ((text: string) => {
    try {
      const doc = JSON.parse(text);
      return { doc, issues: [] };
    } catch (error) {
      return { doc: null, issues: [{ path: [], message: `Not valid JSON: ${(error as Error).message}`, severity: "error" }] };
    }
  });
  return {
    draftKey: "osionos:theme-draft:test",
    initialText,
    parse,
    preview,
    restore,
    save,
    ...overrides,
  };
}

test("typing valid text calls preview once per 120 ms burst", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const preview = mock.fn();
    const config = makeConfig({ preview });
    const onChange = mock.fn();
    const draft = createJsonDraft(config, onChange);
    draft.setText('{"name":"B"}');
    assert.equal(preview.mock.callCount(), 0);
    mock.timers.tick(120);
    assert.equal(preview.mock.callCount(), 1);
  } finally {
    mock.timers.reset();
    sessionStore.clear();
  }
});

test("invalid JSON never calls preview", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const preview = mock.fn();
    const config = makeConfig({ preview });
    const onChange = mock.fn();
    const draft = createJsonDraft(config, onChange);
    draft.setText("{not json");
    mock.timers.tick(200);
    assert.equal(preview.mock.callCount(), 0);
  } finally {
    mock.timers.reset();
    sessionStore.clear();
  }
});

test("revert calls restore and sets dirty to false", () => {
  const restore = mock.fn();
  const config = makeConfig({ restore, initialText: () => '{"name":"A"}' });
  const onChange = mock.fn();
  const draft = createJsonDraft(config, onChange);
  draft.setText('{"name":"B"}');
  assert.equal(draft.state.dirty, true);
  draft.revert();
  assert.equal(restore.mock.callCount(), 1);
  assert.equal(draft.state.dirty, false);
  sessionStore.clear();
});

test("a dirty draft is written to sessionStorage on dispose and restored on the next mount", () => {
  const config = makeConfig({ initialText: () => '{"name":"A"}' });
  const onChange = () => undefined;
  const draft = createJsonDraft(config, onChange);
  draft.setText('{"name":"B"}');
  draft.dispose();
  assert.equal(sessionStore.get("osionos:theme-draft:test"), '{"name":"B"}');
  const next = createJsonDraft(config, () => undefined);
  assert.equal(next.state.restored, true);
  assert.equal(next.state.text, '{"name":"B"}');
  sessionStore.clear();
});

// StrictMode mounts, unmounts and mounts again in dev: the rehearsal unmount
// disposes the same draft the real unmount disposes later.
test("a draft disposed by a rehearsal unmount still keeps its edits on the real one", () => {
  const draft = createJsonDraft(makeConfig({ initialText: () => '{"name":"A"}' }), () => undefined);
  draft.dispose();
  draft.setText('{"name":"B"}');
  draft.dispose();
  assert.equal(sessionStore.get("osionos:theme-draft:test"), '{"name":"B"}');
  sessionStore.clear();
});

test("save with an error result keeps dirty true and adds an issue at path", () => {
  const save = () => ({ ok: false, message: "name taken", path: ["name"] });
  const config = makeConfig({ save });
  const onChange = () => undefined;
  const draft = createJsonDraft(config, onChange);
  draft.setText('{"name":"B"}');
  draft.save();
  assert.equal(draft.state.dirty, true);
  assert.ok(draft.state.issues.some((issue: any) => issue.path.join(".") === "name" && issue.message === "name taken"));
  sessionStore.clear();
});

// Revert used to write the editor from the last rendered state, which still held
// the edit: the editor kept "#999999" and its echo re-applied it after restore.
test("revert hands back the saved text, and the editor echoing it keeps the draft clean", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const preview = mock.fn();
    const draft = createJsonDraft(makeConfig({ preview, initialText: () => '{"name":"A"}' }), () => undefined);
    draft.setText('{"name":"B"}');
    const text = draft.revert();
    assert.equal(text, '{"name":"A"}');
    draft.setText(text);
    mock.timers.tick(200);
    assert.equal(draft.state.dirty, false);
    assert.equal(preview.mock.callCount(), 0);
  } finally {
    mock.timers.reset();
    sessionStore.clear();
  }
});
