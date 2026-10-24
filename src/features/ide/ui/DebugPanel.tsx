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

import { Tooltip } from "@/shared/ui";

import { continueRun, stepIn, stepOut, stepOver, stopDebug } from "../model/debugController";
import { useDebugStore } from "../model/debugStore";

const BTN = "osio-code-btn h-6 w-6 shrink-0 disabled:opacity-40";
const HEADING = "px-1 pb-1 pt-2 text-2xs font-medium text-[var(--osio-code-fg-muted)]";
const ROW = "truncate px-1 py-0.5 font-mono text-xs text-[var(--osio-code-fg-muted)]";

const STEPS = [
  { label: "Continue", icon: Play, run: continueRun },
  { label: "Step over", icon: ArrowRight, run: stepOver },
  { label: "Step into", icon: ArrowDown, run: stepIn },
  { label: "Step out", icon: ArrowUp, run: stepOut },
] as const;

/** Resume/step/stop toolbar. The step buttons need a stopped thread (the
 *  controller no-ops them while running); Stop needs a live session. O(1). */
const DebugToolbar: React.FC = () => {
  const status = useDebugStore((s) => s.status);
  const halted = status === "stopped";
  const stoppable = status !== "idle" && status !== "ended";
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--osio-code-border)] px-2">
      {STEPS.map(({ label, icon: Icon, run }) => (
        <Tooltip key={label} label={label} side="bottom">
          <button type="button" aria-label={label} disabled={!halted} onClick={run} className={BTN}>
            <Icon size={14} />
          </button>
        </Tooltip>
      ))}
      <Tooltip label="Stop" side="bottom">
        <button type="button" aria-label="Stop" disabled={!stoppable} onClick={() => void stopDebug()} className={BTN}>
          <Square size={14} />
        </button>
      </Tooltip>
    </div>
  );
};

/** One-line session state for screen readers and sighted users alike. O(1). */
const DebugStatusLine: React.FC = () => {
  const status = useDebugStore((s) => s.status);
  const stoppedReason = useDebugStore((s) => s.stoppedReason);
  const error = useDebugStore((s) => s.error);
  return (
    <div role="status" className="shrink-0 border-b border-[var(--osio-code-border)] px-3 py-1 font-mono text-2xs text-[var(--osio-code-fg-muted)]">
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
    <section aria-label="Call stack">
      <h3 className={HEADING}>Call stack</h3>
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
      <pre className="whitespace-pre-wrap break-all px-1 py-0.5 font-mono text-xs text-[var(--osio-code-fg)]">
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
      <p className="osio-code-empty">
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
