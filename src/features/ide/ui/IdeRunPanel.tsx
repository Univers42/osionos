/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeRunPanel.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Play, Square, Trash2 } from "lucide-react";

import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { codeBlockOf } from "../model/codeFile";
import { languageById, languageForFileName } from "../model/ideLanguages";
import { useCodeRunner } from "../model/useCodeRunner";
import { streamClass } from "./RunConsole";

/**
 * The activity-bar "Run" panel — runs the active code file through the code
 * runner (Plane A, `POST /api/ide/run`) and streams its output, without leaving
 * the sidebar. Reuses the proven `useCodeRunner` hook + `RunConsole`'s stream
 * colour map (library-first). Runs the file's saved content (the editor mirrors
 * edits on a debounce), so it stays in step with what's persisted. Full DAP
 * debugging + a tasks system land with the sandbox shell (see IDE-BACKLOG Epic 3).
 */
export const IdeRunPanel: React.FC = () => {
  const activePageId = usePageStore((s) => s.activePage?.id ?? null);
  const page = usePageStore((s) => (activePageId ? s.pageById(activePageId) : undefined));
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  const { lines, running, exit, run, clear, stop } = useCodeRunner();

  const isCode = page?.surface === "code";
  const block = codeBlockOf(page);
  const contentLoaded = Array.isArray(page?.content);
  const languageId = block?.language ?? (page ? languageForFileName(page.title).id : "plaintext");
  const lang = languageById(languageId);

  // Load the active code file's content so there's a source to run.
  React.useEffect(() => {
    if (isCode && page && !contentLoaded && jwt && activePageId) {
      void usePageStore.getState().fetchPageContent(activePageId, jwt);
    }
  }, [isCode, page, contentLoaded, jwt, activePageId]);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const onRun = React.useCallback(() => {
    if (!isCode || !lang.runnable) return;
    void run(lang.id, block?.content ?? "");
  }, [isCode, lang.runnable, lang.id, block?.content, run]);

  const failed = exit != null && (exit.timedOut || (exit.code ?? 0) !== 0);
  const btn =
    "inline-flex h-6 items-center gap-1 rounded px-1.5 text-[var(--osio-code-fg-muted)] hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)] disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1 px-3 pb-2">
        {!isCode ? (
          <p className="py-4 text-center text-[11px] leading-5 text-[var(--osio-code-fg-muted)]">
            Open a code file to run it.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="truncate font-mono text-[var(--osio-code-fg)]">{page?.title || "untitled"}</span>
              <span style={{ color: lang.accent }}>{lang.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={btn}
                disabled={!lang.runnable || running}
                onClick={onRun}
                title={lang.runnable ? "Run file" : `${lang.label} isn't runnable`}
              >
                <Play size={12} /> Run
              </button>
              {running && (
                <button type="button" className={btn} onClick={stop} title="Stop">
                  <Square size={12} /> Stop
                </button>
              )}
              <button type="button" className={btn} onClick={clear} title="Clear">
                <Trash2 size={12} /> Clear
              </button>
              <span className="flex-1" />
              {running && <span className="text-[10px] text-[var(--osio-accent)]">running…</span>}
              {!running && exit && (
                <span
                  className={"text-[10px] " + (failed ? "text-[var(--osio-danger,#ff6b6b)]" : "text-[var(--osio-success)]")}
                >
                  {exit.timedOut ? "timed out" : `exit ${exit.code ?? "?"}`} · {exit.durationMs}ms
                </span>
              )}
            </div>
            {!lang.runnable && (
              <p className="text-[10px] text-[var(--osio-code-fg-muted)]">{lang.label} is not runnable.</p>
            )}
          </>
        )}
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto border-t border-[var(--osio-code-border)] px-3 py-2 font-mono text-[11px] leading-5"
      >
        {lines.length === 0 ? (
          <div className="italic text-[var(--osio-code-fg-muted)]">Run output appears here.</div>
        ) : (
          lines.map((line, i) => (
            <pre key={i} className={"whitespace-pre-wrap break-words " + streamClass[line.stream]}>
              {line.text}
            </pre>
          ))
        )}
      </div>
    </div>
  );
};
