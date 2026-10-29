/**
 * The reasoning effort of a run: Low, Medium or High.
 *
 * A radio group the keyboard drives (arrows move the choice). It is drawn only
 * for a model that reasons: the picker that holds the model list decides.
 * Medium is what shows when nothing was chosen; it is not stored until the
 * reader picks one, so a run without a choice keeps the service's default.
 */

import React from "react";

import { AI_EFFORTS, type AiEffort } from "@/features/ai/model/aiSelection";

const LABELS: Record<AiEffort, string> = { low: "Low", medium: "Medium", high: "High" };

interface Props {
  value?: AiEffort;
  onChange: (effort: AiEffort) => void;
}

export const EffortPicker: React.FC<Props> = ({ value = "medium", onChange }) => {
  const move = (event: React.KeyboardEvent, from: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = AI_EFFORTS[(from + step + AI_EFFORTS.length) % AI_EFFORTS.length];
    onChange(next);
    (event.currentTarget.parentElement?.children[AI_EFFORTS.indexOf(next)] as HTMLElement | undefined)?.focus();
  };

  return (
    <span
      role="radiogroup"
      aria-label="Reasoning effort"
      data-testid="effort-picker"
      className="inline-flex items-center rounded-md border border-[var(--osio-border-default)] p-0.5"
    >
      {AI_EFFORTS.map((effort, index) => {
        const checked = effort === value;
        return (
          <button
            key={effort}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(effort)}
            onKeyDown={(event) => move(event, index)}
            className={`rounded-sm px-2 py-0.5 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] ${
              checked
                ? "bg-[var(--osio-bg-hover)] text-[var(--osio-fg-default)]"
                : "text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
            }`}
          >
            {LABELS[effort]}
          </button>
        );
      })}
    </span>
  );
};
