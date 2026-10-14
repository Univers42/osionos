/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DebugPanel.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ArrowDown, ArrowRight, ArrowUp, Play, Square } from "lucide-react";

import { continueRun, stepIn, stepOut, stepOver, stopDebug } from "../model/debugController";
import { useDebugStore } from "../model/debugStore";

const BTN =
  "flex h-6 w-6 items-center justify-center rounded text-[var(--osio-code-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-code-fg)] disabled:opacity-40";
const HEADING = "py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--osio-code-fg-muted)]";
const ROW = "truncate px-1 py-0.5 font-mono text-[12px] text-[var(--osio-code-fg-muted)]";

/** Resume/step/stop toolbar. The step buttons need a stopped thread (the
 *  controller no-ops them while running); Stop needs a live session. O(1). */
const DebugToolbar: React.FC = () => {
  const status = useDebugStore((s) => s.status);
  const halted = status === "stopped";
  const stoppable = status !== "idle" && status !== "ended";
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--osio-code-border)] px-2">
      <button type="button" aria-label="Continue" title="Continue" disabled={!halted} onClick={continueRun} className={BTN}>
        <Play size={14} />
      </button>
      <button type="button" aria-label="Step Over" title="Step Over" disabled={!halted} onClick={stepOver} className={BTN}>
        <ArrowRight size={14} />
      </button>
      <button type="button" aria-label="Step Into" title="Step Into" disabled={!halted} onClick={stepIn} className={BTN}>
        <ArrowDown size={14} />
      </button>
      <button type="button" aria-label="Step Out" title="Step Out" disabled={!halted} onClick={stepOut} className={BTN}>
        <ArrowUp size={14} />
      </button>
      <button type="button" aria-label="Stop" title="Stop" disabled={!stoppable} onClick={() => void stopDebug()} className={BTN}>
        <Square size={14} />
      </button>
    </div>
  );
};

/** One-line session state for screen readers and sighted users alike. O(1). */
const DebugStatusLine: React.FC = () => {
  const status = useDebugStore((s) => s.status);
  const stoppedReason = useDebugStore((s) => s.stoppedReason);
  const error = useDebugStore((s) => s.error);
  return (
    <div role="status" className="shrink-0 border-b border-[var(--osio-code-border)] px-3 py-1 font-mono text-[11px] text-[var(--osio-code-fg-muted)]">
      {status}
      {status === "stopped" && stoppedReason ? ` — ${stoppedReason}` : null}
      {error ? ` — ${error}` : null}
    </div>
  );
};

/** Call stack, top frame first; stdlib frames carry no workspace path. O(f). */
const DebugStack: React.FC = () => {
  const frames = useDebugStore((s) => s.frames);
  return (
    <section aria-label="Call Stack">
      <h3 className={HEADING}>Call Stack</h3>
      {frames.length === 0 ? (
        <p className={ROW}>No frames.</p>
      ) : (
        <ul>
          {frames.map((frame) => {
            const where = frame.path === null ? "(library)" : `${frame.path}:${frame.line}`;
            return <li key={frame.id} className={ROW}>{`${frame.name} — ${where}`}</li>;
          })}
        </ul>
      )}
    </section>
  );
};

/** Locals of the top frame; the type rides muted behind the value. O(v). */
const DebugVariables: React.FC = () => {
  const variables = useDebugStore((s) => s.variables);
  return (
    <section aria-label="Variables">
      <h3 className={HEADING}>Variables</h3>
      {variables.length === 0 ? (
        <p className={ROW}>No variables.</p>
      ) : (
        <ul>
          {variables.map((variable, index) => (
            <li key={`${index}:${variable.name}`} className={ROW}>
              {`${variable.name} = ${variable.value}`}
              {variable.type ? <span className="text-[var(--osio-code-fg-muted)]">{` (${variable.type})`}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// Ponytail: shows only the newest 200 lines, so a longer run loses its start —
// including the first traceback when the program fails after chattering a lot.
const DebugOutput: React.FC = () => {
  const output = useDebugStore((s) => s.output);
  return (
    <section aria-label="Output">
      <h3 className={HEADING}>Output</h3>
      <pre className="whitespace-pre-wrap break-all px-1 py-0.5 font-mono text-[12px] text-[var(--osio-code-fg)]">
        {output.slice(-200).join("\n")}
      </pre>
    </section>
  );
};

/** The dock's DEBUG tab: toolbar, status, stack, locals, program output. Every
 *  string shown came from the sandbox adapter and renders as text only. O(1)
 *  besides the three lists below. */
export const DebugPanel: React.FC = () => {
  const status = useDebugStore((s) => s.status);
  if (status === "idle") {
    return (
      <p className="px-3 py-6 text-center text-[11px] leading-5 text-[var(--osio-code-fg-muted)]">
        Open a Python file, click the gutter to set breakpoints, then press F5 or choose Terminal → Debug Python File.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DebugToolbar />
      <DebugStatusLine />
      <div className="min-h-0 flex-1 overflow-auto px-3 py-1">
        <DebugStack />
        <DebugVariables />
        <DebugOutput />
      </div>
    </div>
  );
};
