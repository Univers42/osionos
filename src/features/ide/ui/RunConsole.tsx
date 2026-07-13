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

import type { RunExit, RunLine } from "../model/useCodeRunner";

interface Props {
  lines: RunLine[];
  running: boolean;
  exit: RunExit | null;
  onClear: () => void;
  onStop: () => void;
  onClose: () => void;
}

const streamClass: Record<RunLine["stream"], string> = {
  stdout: "text-[var(--osio-code-fg)]",
  stderr: "text-[var(--osio-danger,#ff6b6b)]",
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
  const btn = "inline-flex h-6 items-center gap-1 rounded px-1.5 text-[var(--osio-code-fg-muted)] hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)]";

  return (
    <div data-code-theme="dark" className="flex h-full min-h-0 flex-col bg-[var(--osio-code-bg)]">
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] px-3 py-1 font-mono text-[11px] text-[var(--osio-code-fg-muted)]">
        <span className="font-semibold uppercase tracking-wide">Terminal</span>
        {running && (
          <span className="inline-flex items-center gap-1 text-[var(--osio-accent)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--osio-accent)]" /> running…
          </span>
        )}
        {!running && exit && (
          <span className={failed ? "text-[var(--osio-danger,#ff6b6b)]" : "text-[var(--osio-success)]"}>
            {exit.timedOut ? "timed out" : `exit ${exit.code ?? "?"}`} · {exit.durationMs}ms
          </span>
        )}
        <span className="flex-1" />
        {running && <button type="button" title="Stop" className={btn} onClick={onStop}><Square size={12} /> Stop</button>}
        <button type="button" title="Clear" className={btn} onClick={onClear}><Trash2 size={12} /> Clear</button>
        <button type="button" title="Hide terminal" className={btn} onClick={onClose}><X size={13} /></button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12px] leading-5">
        {lines.length === 0 ? (
          <div className="italic text-[var(--osio-code-fg-muted)]">Run the file (⌘/Ctrl + Enter) to see output here.</div>
        ) : (
          lines.map((line, i) => (
            <pre key={i} className={"whitespace-pre-wrap break-words " + streamClass[line.stream]}>{line.text}</pre>
          ))
        )}
      </div>
    </div>
  );
};
