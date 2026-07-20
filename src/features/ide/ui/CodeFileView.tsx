/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CodeFileView.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Play, Sparkles, SquareTerminal } from "lucide-react";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

import { LoadingPane } from "@/shared/ui";
import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import { codeBlockOf, createCodeFileBlock } from "../model/codeFile";
import { languageById, languageForFileName } from "../model/ideLanguages";
import { useCodeRunner } from "../model/useCodeRunner";
import { canFormat, formatCode } from "../model/formatCode";
import { pathForPage } from "../model/idePaths";
import { useIdeModeStore } from "../model/ideModeStore";
import { ideFsWrite } from "../model/ideFsClient";
import { baseEditorExtensions } from "./codeMirrorSetup";
import { RunConsole } from "./RunConsole";

const SAVE_DEBOUNCE_MS = 1200;

interface StatusInfo {
  line: number;
  col: number;
  lines: number;
}

/**
 * The IDE editor for a `surface: "code"` page. CodeMirror owns the document
 * (uncontrolled) so typing stays fast and the caret never jumps: the store is
 * written debounced from an updateListener, and the store is NOT pushed back
 * into the editor while it's mounted. The view is rebuilt only when the page or
 * its code block changes (deps `[pageId, blockId]`); the language reconfigures
 * through a Compartment without a rebuild. A pending save is flushed on unmount
 * so switching panes never drops the last keystrokes.
 */
export const CodeFileView: React.FC<{ pageId: string }> = ({ pageId }) => {
  const page = usePageStore((s) => s.pageById(pageId));
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const isIdeMode = useIdeModeStore((s) => s.isIdeMode(workspaceId));
  const block = codeBlockOf(page);
  const contentLoaded = Array.isArray(page?.content);

  // Self-fetch the page body if only its metadata is loaded (the block editor
  // does the same; PageTabView only fetches when the page is entirely absent).
  React.useEffect(() => {
    if (page && !contentLoaded && jwt) usePageStore.getState().fetchPageContent(pageId, jwt);
  }, [page, contentLoaded, jwt, pageId]);

  // A code page with no code block yet (freshly created / imported) → seed one.
  React.useEffect(() => {
    if (contentLoaded && page && !block) {
      usePageStore.getState().updatePageContent(pageId, [createCodeFileBlock(page.title)]);
    }
  }, [contentLoaded, page, block, pageId]);

  const blockId = block?.id;
  const languageId = block?.language ?? (page ? languageForFileName(page.title).id : "plaintext");
  const lang = languageById(languageId);

  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const langCompartmentRef = React.useRef<Compartment | null>(null);
  const lspCompartmentRef = React.useRef<Compartment | null>(null);
  const [status, setStatus] = React.useState<StatusInfo>({ line: 1, col: 1, lines: 1 });
  const runner = useCodeRunner();
  const [showConsole, setShowConsole] = React.useState(false);
  // Run the CURRENT editor text. A ref keeps the CodeMirror keymap (built once)
  // calling the latest closure without rebuilding the editor.
  const runNow = React.useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    setShowConsole(true);
    runner.run(lang.id, view.state.doc.toString());
  }, [runner, lang.id]);
  const runRef = React.useRef(runNow);
  // Keep the ref current in an effect (not during render — the repo forbids ref
  // writes in render); the built-once keymap calls runRef.current().
  React.useEffect(() => { runRef.current = runNow; }, [runNow]);

  // Auto-format: browser Prettier (web langs) or the runner (python/c/cpp).
  const [formatError, setFormatError] = React.useState<string | null>(null);
  const formatNow = React.useCallback(async () => {
    const view = viewRef.current;
    if (!view || !canFormat(lang.id)) return;
    const source = view.state.doc.toString();
    try {
      const formatted = await formatCode(lang.id, source);
      if (formatted !== source) {
        const cursor = view.state.selection.main.head;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted }, selection: { anchor: Math.min(cursor, formatted.length) } });
      }
      setFormatError(null);
    } catch (error) {
      setFormatError(error instanceof Error ? error.message.split("\n")[0].slice(0, 80) : "Format failed");
    }
  }, [lang.id]);
  const formatRef = React.useRef(formatNow);
  React.useEffect(() => { formatRef.current = formatNow; }, [formatNow]);
  React.useEffect(() => {
    if (!formatError) return;
    const timer = setTimeout(() => setFormatError(null), 4000);
    return () => clearTimeout(timer);
  }, [formatError]);

  // Build the editor once per (page, block). Reads the initial doc from the
  // store at build time; writes back debounced via getState() (no stale closure).
  React.useEffect(() => {
    const host = hostRef.current;
    if (!host || !blockId) return;

    const initialText = codeBlockOf(usePageStore.getState().pageById(pageId))?.content ?? "";
    const langCompartment = new Compartment();
    langCompartmentRef.current = langCompartment;
    const lspCompartment = new Compartment();
    lspCompartmentRef.current = lspCompartment;

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let pending: string | null = null;
    const flush = () => {
      saveTimer = null;
      if (pending == null) return;
      const content = pending;
      pending = null;
      usePageStore.getState().updateBlock(pageId, blockId, { content });
      // Mirror to the sandbox so the shell/LSP see the latest edit (IDE mode
      // only). ideFsWrite records the echo hash → no writeback loop.
      const wsId = useUserStore.getState().activeWorkspace()?._id ?? "";
      if (wsId && useIdeModeStore.getState().isIdeMode(wsId)) {
        void ideFsWrite(wsId, pathForPage(pageId, (id) => usePageStore.getState().pageById(id)), content);
      }
    };

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          langCompartment.of([]),
          lspCompartment.of([]), // LSP wired in only in IDE mode (effect below)
          // Editor-scoped keymaps (zero conflict with the global automations
          // dispatcher): Cmd/Ctrl+Enter runs, Cmd/Ctrl+Alt+L formats.
          Prec.highest(keymap.of([
            { key: "Mod-Enter", preventDefault: true, run: () => { runRef.current(); return true; } },
            { key: "Mod-Alt-l", preventDefault: true, run: () => { void formatRef.current(); return true; } },
          ])),
          ...baseEditorExtensions(),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              pending = u.state.doc.toString();
              if (saveTimer) clearTimeout(saveTimer);
              saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
            }
            if (u.docChanged || u.selectionSet) {
              const head = u.state.selection.main.head;
              const ln = u.state.doc.lineAt(head);
              setStatus({ line: ln.number, col: head - ln.from + 1, lines: u.state.doc.lines });
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    setStatus({ line: 1, col: 1, lines: view.state.doc.lines });

    return () => {
      if (saveTimer) clearTimeout(saveTimer);
      flush();
      view.destroy();
      viewRef.current = null;
    };
  }, [pageId, blockId]);

  // Load + apply the language extension (async chunk) through the compartment.
  React.useEffect(() => {
    let active = true;
    lang.cmLoad().then((ext) => {
      const view = viewRef.current;
      const compartment = langCompartmentRef.current;
      if (active && view && compartment) view.dispatch({ effects: compartment.reconfigure(ext) });
    });
    return () => {
      active = false;
    };
  }, [lang]);

  // Wire the language server ONLY in IDE mode (keeps @codemirror/lsp-client out
  // of the base editor chunk — dynamic import). Reconfigures on file/lang change;
  // the URI matches the materialized on-disk path so cross-file resolution works.
  React.useEffect(() => {
    let active = true;
    const clear = () => {
      const view = viewRef.current;
      const compartment = lspCompartmentRef.current;
      if (view && compartment) view.dispatch({ effects: compartment.reconfigure([]) });
    };
    if (!isIdeMode || !workspaceId || !blockId) { clear(); return; }
    void import("../model/lspClient").then(({ lspExtensionFor, lspServerFor }) => {
      if (!active) return;
      if (!lspServerFor(languageId)) { clear(); return; }
      const rel = pathForPage(pageId, (id) => usePageStore.getState().pageById(id));
      const ext = lspExtensionFor(languageId, `file:///workspace/${rel}`, workspaceId);
      const view = viewRef.current;
      const compartment = lspCompartmentRef.current;
      if (active && view && compartment && ext) view.dispatch({ effects: compartment.reconfigure(ext) });
    });
    return () => { active = false; };
  }, [pageId, blockId, languageId, isIdeMode, workspaceId]);

  if (!contentLoaded || !blockId) return <LoadingPane />;

  return (
    <div data-code-theme="dark" data-osio-ide className="flex h-full min-h-0 flex-col bg-[var(--osio-code-bg)]">
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />
      {showConsole && (
        <div className="h-56 shrink-0 overflow-hidden">
          <RunConsole lines={runner.lines} running={runner.running} exit={runner.exit} onClear={runner.clear} onStop={runner.stop} onClose={() => setShowConsole(false)} />
        </div>
      )}
      <div className="flex shrink-0 items-center gap-3 border-t border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] px-3 py-1 font-mono text-[11px] text-[var(--osio-code-fg-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: lang.accent }} />
          {lang.label}
        </span>
        {lang.runnable && (
          <button
            type="button"
            title="Run (Ctrl/Cmd + Enter)"
            onClick={runNow}
            disabled={runner.running}
            className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[var(--osio-code-fg-muted)] hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)] disabled:opacity-50"
          >
            <Play size={11} /> {runner.running ? "Running…" : "Run"}
          </button>
        )}
        {canFormat(lang.id) && (
          <button
            type="button"
            title="Format (Ctrl/Cmd + Alt + L)"
            onClick={() => void formatNow()}
            className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[var(--osio-code-fg-muted)] hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)]"
          >
            <Sparkles size={11} /> Format
          </button>
        )}
        <button
          type="button"
          title="Toggle terminal"
          onClick={() => setShowConsole((v) => !v)}
          className="inline-flex h-5 items-center rounded px-1.5 hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)]"
        >
          <SquareTerminal size={12} />
        </button>
        <span className="flex-1" />
        {formatError && <span className="truncate text-[var(--osio-danger,#ff6b6b)]" title={formatError}>⚠ {formatError}</span>}
        <span>Ln {status.line}, Col {status.col}</span>
        <span>{status.lines} {status.lines === 1 ? "line" : "lines"}</span>
        <span>Spaces: 4</span>
        <span>UTF-8</span>
      </div>
    </div>
  );
};
