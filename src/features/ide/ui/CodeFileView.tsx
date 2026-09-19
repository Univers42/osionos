/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CodeFileView.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Play, Sparkles, SquareTerminal } from "lucide-react";

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
import { recordSyncedHash } from "../model/ideSyncEngine";
import { useIdeRevealBus } from "../model/ideRevealBus";
import { useIdeSyncConflicts } from "../model/ideSyncConflicts";
import { useTerminalRunBus } from "../model/terminalRunBus";
import type { IDisposable } from "../model/monacoRuntime";
import { replaceEditorText, useMonacoEditor, type EditorStatus } from "./useMonacoEditor";
import { RunConsole } from "./RunConsole";
import "./monacoEditor.css";

const resolvePage = (id: string) => usePageStore.getState().pageById(id);

/**
 * The IDE editor for a `surface: "code"` page. Monaco owns the document
 * (uncontrolled, see useMonacoEditor) so typing stays fast and the caret never
 * jumps: the store is written debounced from the model's change event, and the
 * store is NOT pushed back into the editor while it's mounted. The editor is
 * rebuilt only when the page or its code block changes (`[pageId, blockId]`);
 * the language is swapped on the live model. A pending save is flushed on
 * unmount so switching panes never drops the last keystrokes. Everything around
 * the text surface (run, format, conflicts, reveal, LSP) is glue over the hook.
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
  const [status, setStatus] = React.useState<EditorStatus>({ line: 1, col: 1, lines: 1 });
  const runner = useCodeRunner();
  const [showConsole, setShowConsole] = React.useState(false);
  const [formatError, setFormatError] = React.useState<string | null>(null);

  // Store write + sandbox mirror (IDE mode only). ideFsWrite records the echo
  // hash → no writeback loop. Reads the stores via getState() (no stale closure).
  const save = React.useCallback((content: string) => {
    if (!blockId) return;
    usePageStore.getState().updateBlock(pageId, blockId, { content });
    const wsId = useUserStore.getState().activeWorkspace()?._id ?? "";
    if (wsId && useIdeModeStore.getState().isIdeMode(wsId)) {
      void ideFsWrite(wsId, pathForPage(pageId, resolvePage), content);
    }
  }, [pageId, blockId]);

  // The built-once keybindings call the latest run/format closures through refs
  // (updated in effects, never during render — the repo forbids ref writes in render).
  const runRef = React.useRef<() => void>(() => undefined);
  const formatRef = React.useRef<() => void>(() => undefined);
  const editorRef = useMonacoEditor(hostRef, {
    pageId,
    blockId,
    monacoId: lang.monacoId,
    uri: `file:///workspace/${pathForPage(pageId, resolvePage)}`,
    readInitialText: () => codeBlockOf(usePageStore.getState().pageById(pageId))?.content ?? "",
    onSave: save,
    onStatus: setStatus,
    onRun: () => runRef.current(),
    onFormat: () => formatRef.current(),
  });

  // Run the CURRENT editor text. In IDE Workspace mode, run in the sandbox's REAL
  // interactive PTY so stdin/input() work (the one-shot runner has no stdin →
  // input() gets EOF). Otherwise fall back to that stateless runner.
  const runNow = React.useCallback(() => {
    const source = editorRef.current?.getValue();
    if (source === undefined) return;
    const wsId = useUserStore.getState().activeWorkspace()?._id ?? "";
    if (wsId && useIdeModeStore.getState().isIdeMode(wsId) && lang.runnable && lang.runCmd) {
      const relPath = pathForPage(pageId, resolvePage);
      const shellPath = `'/workspace/${relPath.replace(/'/g, "'\\''")}'`;
      const command = lang.runCmd.replaceAll("{file}", shellPath);
      useIdeModeStore.getState().setBottomOpen(true); // reveal/connect the terminal
      // Write the latest text FIRST, then dispatch the run — so a fast PTY never
      // executes a stale file. If the terminal is still connecting, the bus keeps
      // the request until it opens; if already open, the subscribe fires it.
      void ideFsWrite(wsId, relPath, source).then(() => useTerminalRunBus.getState().requestRun(command));
      return;
    }
    setShowConsole(true);
    runner.run(lang.id, source);
  }, [runner, lang.id, lang.runnable, lang.runCmd, pageId, editorRef]);
  React.useEffect(() => { runRef.current = runNow; }, [runNow]);

  // Auto-format: browser Prettier (web langs) or the runner (python/c/cpp).
  const formatNow = React.useCallback(async () => {
    const instance = editorRef.current;
    if (!instance || !canFormat(lang.id)) return;
    const source = instance.getValue();
    try {
      const formatted = await formatCode(lang.id, source);
      if (formatted !== source) replaceEditorText(instance, formatted);
      setFormatError(null);
    } catch (error) {
      setFormatError(error instanceof Error ? error.message.split("\n")[0].slice(0, 80) : "Format failed");
    }
  }, [lang.id, editorRef]);
  React.useEffect(() => { formatRef.current = () => void formatNow(); }, [formatNow]);
  React.useEffect(() => {
    if (!formatError) return;
    const timer = setTimeout(() => setFormatError(null), 4000);
    return () => clearTimeout(timer);
  }, [formatError]);


  // Surfaced sandbox divergence (ADR-001 §7): the page kept YOUR content; this
  // banner offers the two one-click resolutions. Never silent last-writer-wins.
  const conflict = useIdeSyncConflicts((s) => s.byPageId[pageId]);
  const resolveKeepMine = React.useCallback(() => {
    if (!conflict) return;
    const mine = editorRef.current?.getValue() ?? "";
    void ideFsWrite(workspaceId, conflict.relPath, mine); // pushes ours + re-records the agreed state
    useIdeSyncConflicts.getState().resolve(pageId);
  }, [conflict, workspaceId, pageId, editorRef]);
  const resolveTakeSandbox = React.useCallback(() => {
    if (!conflict) return;
    const instance = editorRef.current;
    if (instance) replaceEditorText(instance, conflict.theirs);
    recordSyncedHash(workspaceId, conflict.relPath, conflict.theirsHash); // sandbox already holds it
    useIdeSyncConflicts.getState().resolve(pageId);
  }, [conflict, workspaceId, pageId, editorRef]);

  // Consume a pending "reveal line:col" request (Problems/Search click) once
  // THIS page's editor exists — the bus holds it across the lazy load.
  const pendingReveal = useIdeRevealBus((s) => s.pending);
  React.useEffect(() => {
    const instance = editorRef.current;
    const model = instance?.getModel();
    if (!instance || !model || pendingReveal?.pageId !== pageId) return;
    const reveal = useIdeRevealBus.getState().consume(pageId);
    if (!reveal) return;
    const lineNumber = Math.max(1, Math.min(reveal.line, model.getLineCount()));
    const column = Math.max(1, Math.min(reveal.col, model.getLineMaxColumn(lineNumber)));
    instance.setPosition({ lineNumber, column });
    instance.revealPositionInCenter({ lineNumber, column });
    instance.focus();
  }, [pendingReveal, pageId, blockId, editorRef]);

  // Wire the language server ONLY in IDE mode (keeps the LSP layer out of the
  // base editor chunk — dynamic import). Re-attaches on file/lang change; the
  // URI matches the materialized on-disk path so cross-file resolution works.
  React.useEffect(() => {
    if (!isIdeMode || !workspaceId || !blockId) return;
    let active = true;
    let attached: IDisposable | null = null;
    void import("../model/lspMonaco").then(async ({ attachLsp }) => {
      const model = editorRef.current?.getModel();
      if (!active || !model) return;
      const handle = await attachLsp(model, languageId, lang.monacoId, `file:///workspace/${pathForPage(pageId, resolvePage)}`, workspaceId);
      if (!active) { handle?.dispose(); return; }
      attached = handle;
    });
    return () => { active = false; attached?.dispose(); };
  }, [pageId, blockId, languageId, lang.monacoId, isIdeMode, workspaceId, editorRef]);

  if (!contentLoaded || !blockId) return <LoadingPane />;

  return (
    <div data-code-theme="dark" data-osio-ide className="flex h-full min-h-0 flex-col bg-[var(--osio-code-bg)]">
      {conflict && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] px-3 py-1.5 text-[12px] text-[var(--osio-warning,#d97706)]">
          <span className="min-w-0 flex-1 truncate">
            The sandbox version of this file differs from your edits.
          </span>
          <button
            type="button"
            onClick={resolveKeepMine}
            className="shrink-0 rounded border border-[var(--osio-code-border)] px-2 py-0.5 text-[var(--osio-code-fg)] hover:bg-[var(--osio-code-btn-hover)]"
          >
            Keep mine
          </button>
          <button
            type="button"
            onClick={resolveTakeSandbox}
            className="shrink-0 rounded border border-[var(--osio-code-border)] px-2 py-0.5 text-[var(--osio-code-fg)] hover:bg-[var(--osio-code-btn-hover)]"
          >
            Take sandbox
          </button>
        </div>
      )}
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
