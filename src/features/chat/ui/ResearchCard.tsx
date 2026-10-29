/**
 * The card of a research run (C412): where the run stands while it works, and
 * "Save as page" once its report is done (C409). Counts and the phase only —
 * the per-tool rows stay in the Activity tab.
 */

import React, { useState } from "react";
import { FilePlus2, Telescope } from "lucide-react";

import { researchLine, type ResearchPart } from "../model/researchParts";
import type { SaveResearchResult } from "../model/saveResearchPage";

const SAVE_BUTTON =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-default disabled:opacity-50";

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "failed"; words: string };

const SaveAsPage: React.FC<{ onSave: () => Promise<SaveResearchResult> }> = ({ onSave }) => {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const save = async () => {
    setState({ kind: "saving" });
    const result = await onSave();
    setState(result.ok ? { kind: "saved" } : { kind: "failed", words: result.words });
  };
  return (
    <span className="ml-auto inline-flex items-center gap-2">
      {state.kind === "failed" ? <span role="alert" className="text-2xs text-[var(--osio-danger)]">{state.words}</span> : null}
      <button type="button" className={SAVE_BUTTON} data-testid="research-save" disabled={state.kind === "saving" || state.kind === "saved"} onClick={() => void save()}>
        <FilePlus2 size={14} aria-hidden="true" />
        {state.kind === "saved" ? "Saved as page" : state.kind === "saving" ? "Saving…" : "Save as page"}
      </button>
    </span>
  );
};

export const ResearchCard: React.FC<{
  part: ResearchPart;
  finished: boolean;
  /** Present once the report is done and has text: the reader may keep it as a page. */
  onSave?: () => Promise<SaveResearchResult>;
}> = ({ part, finished, onSave }) => (
  <div className="mb-2 flex flex-col gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2" data-testid="research-card">
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--osio-fg-muted)]">
      <Telescope size={14} aria-hidden="true" className="text-[var(--osio-accent)]" />
      <span role="status" aria-live="polite">{researchLine(part, finished)}</span>
      {finished && onSave ? <SaveAsPage onSave={onSave} /> : null}
    </div>
    {!finished && part.maxSteps > 0 ? (
      <progress className="h-1 w-full accent-[var(--osio-accent)]" value={part.step} max={part.maxSteps} aria-label="Research progress" />
    ) : null}
    {part.queries.length > 0 ? (
      <ul className="flex flex-wrap gap-1" aria-label="Planned searches">
        {part.queries.map((query) => (
          <li key={query} className="rounded-md bg-[var(--osio-bg-muted)] px-1.5 py-0.5 text-2xs text-[var(--osio-fg-muted)]">{query}</li>
        ))}
      </ul>
    ) : null}
  </div>
);
