/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RunConsole.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Square, Trash2, X } from "lucide-react";

import { Tooltip } from "@/shared/ui";
import type { RunExit, RunLine } from "../model/useCodeRunner";

interface Props {
  lines: RunLine[];
  running: boolean;
  exit: RunExit | null;
  onClear: () => void;
  onStop: () => void;
  onClose: () => void;
}

/** Per-stream text colour for a run-output line. Shared with the Run panel. */
export const streamClass: Record<RunLine["stream"], string> = {
  stdout: "text-[var(--osio-code-fg)]",
  stderr: "text-[var(--osio-danger)]",
  system: "text-[var(--osio-code-fg-muted)]",
};

/** Terminal-style output panel for a code run — streams stdout/stderr, auto-
 *  scrolls, and shows the exit status. Dep-free (no xterm); the runner's output
 *  is a pipe so there's no ANSI colour to render. */
export const RunConsole: React.FC<Props> = ({ lines, running, exit, onClear, onStop, onClose }) => {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const failed = exit != null && (exit.timedOut || (exit.code ?? 0) !== 0);
  const btn = "osio-code-btn h-6 text-xs";

  return (
    <div data-code-theme="dark" data-osio-code-chrome className="flex h-full min-h-0 flex-col bg-[var(--osio-code-bg)]">
      <div className="flex h-9 shrink-0 items-center gap-2 border-t border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] px-3 text-xs text-[var(--osio-code-fg-muted)]">
        <span className="font-medium text-[var(--osio-code-fg)]">Terminal</span>
        {running && (
          <span className="inline-flex items-center gap-1 text-[var(--osio-code-caret)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--osio-code-caret)]" /> running…
          </span>
        )}
        {!running && exit && (
          <span className={failed ? "text-[var(--osio-danger)]" : "text-[var(--osio-success)]"}>
            {exit.timedOut ? "timed out" : `exit ${exit.code ?? "?"}`} · {exit.durationMs}ms
          </span>
        )}
        <span className="flex-1" />
        {running && <button type="button" className={`${btn} px-2`} onClick={onStop}><Square size={12} aria-hidden /> Stop</button>}
        <button type="button" className={`${btn} px-2`} onClick={onClear}><Trash2 size={12} aria-hidden /> Clear</button>
        <Tooltip label="Hide terminal" side="top">
          <button type="button" aria-label="Hide terminal" className={`${btn} w-6`} onClick={onClose}><X size={14} aria-hidden /></button>
        </Tooltip>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-5">
        {lines.length === 0 ? (
          <p className="osio-code-empty">Run the file (⌘/Ctrl + Enter) to see output here.</p>
        ) : (
          lines.map((line, i) => (
            <pre key={i} className={"whitespace-pre-wrap break-words " + streamClass[line.stream]}>{line.text}</pre>
          ))
        )}
      </div>
    </div>
  );
};
