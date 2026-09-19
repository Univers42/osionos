/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useMonacoEditor.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { editor, KeyCode, KeyMod } from "../model/monacoRuntime";
import { acquireModel, releaseModel } from "../model/monacoModels";
import { loadMonacoLanguage } from "../model/monacoLanguages";
import { editorFontFamily, OSIO_THEME, watchEditorTheme } from "./monacoTheme";

const SAVE_DEBOUNCE_MS = 1200;

export interface EditorStatus {
  line: number;
  col: number;
  lines: number;
}

export interface MonacoEditorConfig {
  /** Rebuild keys: a new (page, block) is a new editor. */
  pageId: string;
  blockId: string | undefined;
  /** Monaco language id — swapped on the live model, never a rebuild. */
  monacoId: string;
  /** Model URI, fixed at build time; matches the sandbox path so the LSP resolves across files. */
  uri: string;
  readInitialText(): string;
  onSave(text: string): void;
  onStatus(status: EditorStatus): void;
  onRun(): void;
  onFormat(): void;
}

// Posture: what CodeMirror shipped, not Monaco's defaults. No minimap, no
// word-based suggestions (completion is the LSP's or nobody's), no sticky
// scroll, no indent/bracket guides, no bracket-pair colors (the palette owns
// bracket color), and automaticLayout because the IDE's dockable panels and zen
// mode resize the host without a window resize event. Metrics match the shipped
// editor: 13px, 1.6 line-height (21px), 10px vertical padding, 4-space indent.
const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  fontSize: 13,
  lineHeight: 21,
  fontLigatures: false,
  padding: { top: 10, bottom: 10 },
  tabSize: 4,
  insertSpaces: true,
  detectIndentation: false,
  minimap: { enabled: false },
  wordBasedSuggestions: "off",
  suggest: { showWords: false, preview: false },
  scrollBeyondLastLine: false,
  renderLineHighlight: "line",
  folding: true,
  foldingHighlight: false,
  bracketPairColorization: { enabled: false },
  guides: { indentation: false, bracketPairs: false, highlightActiveIndentation: false },
  matchBrackets: "always",
  stickyScroll: { enabled: false },
  selectionHighlight: false,
  occurrencesHighlight: "off",
  renderWhitespace: "none",
  lineNumbersMinChars: 3,
  lineDecorationsWidth: 12,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  fixedOverflowWidgets: true,
  scrollbar: { useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  codeLens: false,
  inlayHints: { enabled: "off" },
  accessibilitySupport: "auto",
  ariaLabel: "Code editor",
  mouseWheelZoom: false,
  smoothScrolling: false,
  cursorSmoothCaretAnimation: "off",
};

/** Replace the whole document as one undoable edit, keeping the caret at the same offset. */
export function replaceEditorText(instance: editor.IStandaloneCodeEditor, text: string): void {
  const model = instance.getModel();
  if (!model) return;
  const offset = model.getOffsetAt(instance.getPosition() ?? { lineNumber: 1, column: 1 });
  instance.executeEdits("osio", [{ range: model.getFullModelRange(), text }]);
  instance.setPosition(model.getPositionAt(Math.min(offset, text.length)));
}

/**
 * One Monaco editor on `hostRef`, uncontrolled: the model owns the text, the
 * store is written debounced from onDidChangeModelContent and never pushed back
 * while mounted (the caret never jumps). Rebuilt only when (pageId, blockId)
 * changes; the language is swapped on the live model; a pending save is flushed
 * on unmount so switching panes never drops the last keystrokes. Editor AND
 * model are disposed on unmount (StrictMode double-mounts in dev; a leaked model
 * is the classic Monaco memory bug). Callbacks are read through a ref so the
 * built-once keybindings always call the latest closure.
 */
export function useMonacoEditor(
  hostRef: React.RefObject<HTMLDivElement | null>,
  config: MonacoEditorConfig,
): React.MutableRefObject<editor.IStandaloneCodeEditor | null> {
  const editorRef = React.useRef<editor.IStandaloneCodeEditor | null>(null);
  const configRef = React.useRef(config);
  React.useEffect(() => { configRef.current = config; });
  const { pageId, blockId, monacoId } = config;

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !blockId) return;
    const current = configRef.current;
    const model = acquireModel(current.uri, current.readInitialText(), "plaintext", pageId);
    const stopTheme = watchEditorTheme(host);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const instance = editor.create(host, {
      ...EDITOR_OPTIONS,
      model,
      theme: OSIO_THEME,
      fontFamily: editorFontFamily(host),
      cursorBlinking: reducedMotion ? "solid" : "blink",
    });
    editorRef.current = instance;
    // Editor-scoped keybindings (zero conflict with the global automations
    // dispatcher): Cmd/Ctrl+Enter runs, Cmd/Ctrl+Alt+L formats.
    instance.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => configRef.current.onRun());
    instance.addCommand(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyL, () => configRef.current.onFormat());

    const reportStatus = () => {
      const position = instance.getPosition();
      configRef.current.onStatus({ line: position?.lineNumber ?? 1, col: position?.column ?? 1, lines: model.getLineCount() });
    };
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let pending: string | null = null;
    const flush = () => {
      saveTimer = null;
      if (pending == null) return;
      const text = pending;
      pending = null;
      configRef.current.onSave(text);
    };
    const subscriptions = [
      model.onDidChangeContent(() => {
        pending = model.getValue();
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
        reportStatus();
      }),
      instance.onDidChangeCursorPosition(reportStatus),
    ];
    reportStatus();
    // The mono web font may land after the first paint; Monaco caches glyph
    // widths at creation, so re-measure once the fonts are in.
    void document.fonts.ready.then(() => { if (editorRef.current === instance) editor.remeasureFonts(); });

    return () => {
      if (saveTimer) clearTimeout(saveTimer);
      flush();
      for (const sub of subscriptions) sub.dispose();
      stopTheme();
      instance.dispose();
      editorRef.current = null;
      releaseModel(model);
    };
  }, [hostRef, pageId, blockId]);

  // The grammar is a lazy chunk; the model switches language once it is registered.
  React.useEffect(() => {
    let active = true;
    void loadMonacoLanguage(monacoId).then(() => {
      const model = editorRef.current?.getModel();
      if (active && model && !model.isDisposed()) editor.setModelLanguage(model, monacoId);
    });
    return () => { active = false; };
  }, [monacoId, pageId, blockId]);

  return editorRef;
}
