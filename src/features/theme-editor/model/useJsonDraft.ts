/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useJsonDraft.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A small draft controller for a JSON document: it owns the text, parses it
// after a 120 ms pause, previews valid documents, and reverts to the saved
// version. It is framework-free so it can be exercised under node:test; the
// hook below is only a thin React binding over it.

import React from "react";

import type { ThemeIssue } from "@/shared/config/themeDoc";

export interface DraftConfig<D> {
  draftKey: string;
  initialText: () => string;
  parse: (text: string) => { doc: D | null; issues: ThemeIssue[] };
  preview: (doc: D) => void;
  restore: () => void;
  save: (doc: D) => { ok: true } | { ok: false; message: string; path?: string[] };
}

export interface DraftState<D> {
  text: string;
  issues: ThemeIssue[];
  dirty: boolean;
  restored: boolean;
  doc: D | null;
}

function sessionStorageRef(): Storage {
  if (typeof globalThis.sessionStorage === "undefined" || globalThis.sessionStorage === null) {
    const memory = new Map<string, string>();
    const shim = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, String(value)),
      removeItem: (key: string) => void memory.delete(key),
      clear: () => memory.clear(),
      key: (index: number) => [...memory.keys()][index] ?? null,
      get length() { return memory.size; },
    } as Storage;
    (globalThis as { sessionStorage?: Storage }).sessionStorage = shim;
  }
  return globalThis.sessionStorage as Storage;
}

const DEBOUNCE_MS = 120;

export function createJsonDraft<D>(config: DraftConfig<D>, onChange: (state: DraftState<D>) => void) {
  const storage = sessionStorageRef();
  let restored = false;
  let text = config.initialText();
  const storedDraft = storage.getItem(config.draftKey);
  if (storedDraft !== null) {
    text = storedDraft;
    restored = true;
  }
  const initialParse = config.parse(text);
  let state: DraftState<D> = {
    text,
    issues: initialParse.issues,
    dirty: restored,
    restored,
    doc: initialParse.doc,
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function commit(next: DraftState<D>) {
    state = next;
    onChange(state);
  }

  if (restored && initialParse.doc) {
    try { config.preview(initialParse.doc); } catch { /* ignore preview errors */ }
  }

  function scheduleParse() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const parsed = config.parse(state.text);
      commit({ text: state.text, issues: parsed.issues, dirty: state.dirty, restored: state.restored, doc: parsed.doc });
      if (parsed.doc) {
        try { config.preview(parsed.doc); } catch { /* ignore */ }
      }
    }, DEBOUNCE_MS);
  }

  function setText(nextText: string) {
    commit({ text: nextText, issues: state.issues, dirty: true, restored: state.restored, doc: state.doc });
    scheduleParse();
  }

  function save() {
    if (timer) { clearTimeout(timer); timer = null; }
    const parsed = config.parse(state.text);
    if (!parsed.doc) {
      commit({ text: state.text, issues: parsed.issues.length ? parsed.issues : state.issues, dirty: state.dirty, restored: state.restored, doc: null });
      return;
    }
    const result = config.save(parsed.doc);
    if (result.ok) {
      storage.removeItem(config.draftKey);
      commit({ text: state.text, issues: parsed.issues, dirty: false, restored: false, doc: parsed.doc });
    } else {
      const issue: ThemeIssue = { path: result.path ?? [], message: result.message, severity: "error" };
      commit({ text: state.text, issues: [...parsed.issues, issue], dirty: true, restored: state.restored, doc: parsed.doc });
    }
  }

  function revert() {
    if (timer) { clearTimeout(timer); timer = null; }
    storage.removeItem(config.draftKey);
    const initial = config.initialText();
    const parsed = config.parse(initial);
    config.restore();
    commit({ text: initial, issues: parsed.issues, dirty: false, restored: false, doc: parsed.doc });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (state.dirty) {
      storage.setItem(config.draftKey, state.text);
      config.restore();
    }
  }

  onChange(state);

  const api = { state: null as unknown as DraftState<D>, setText, save, revert, dispose };
  Object.defineProperty(api, "state", { get: () => state });
  return api as { state: DraftState<D>; setText: (text: string) => void; save: () => void; revert: () => void; dispose: () => void };
}

export function useJsonDraft<D>(config: DraftConfig<D>) {
  const [state, setState] = React.useState<DraftState<D> | null>(null);
  const draft = React.useMemo(() => createJsonDraft(config, (next) => setState(next)), [config]);
  React.useEffect(() => {
    return () => { draft.dispose(); };
  }, [draft]);
  const current = state ?? draft.state;
  return {
    state: current,
    text: current.text,
    setText: draft.setText,
    issues: current.issues,
    dirty: current.dirty,
    restored: current.restored,
    save: draft.save,
    revert: draft.revert,
  };
}
