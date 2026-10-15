import React, { useState } from "react";

import { Dropdown } from "@/shared/ui";

const STAGES = ["Todo", "Doing", "Done"].map((stage) => ({ value: stage, label: stage }));

/** A floating surface made from the overlay recipe alone, with no kit component in it. */
export const OverlayRecipeSample: React.FC = () => (
  <div data-testid="recipe-overlay" className="osio-surface-overlay">
    <p className="px-2 py-1 text-sm text-[var(--osio-fg-default)]">osio-surface-overlay</p>
  </div>
);

/** The control, chip and field recipes, as host markup uses them, and the kit dropdown that wears the same tokens. */
export const RecipeSamples: React.FC = () => {
  const [stage, setStage] = useState("Doing");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-testid="recipe-control" className="osio-control border border-[var(--osio-control-border)] px-3 text-sm text-[var(--osio-fg-default)]">
          osio-control
        </button>
        <span data-testid="recipe-chip" className="osio-chip">osio-chip</span>
        <span className="osio-chip">Design</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input data-testid="recipe-field" aria-label="Sample field" className="osio-field px-2.5 text-sm" placeholder="osio-field" />
        <input aria-label="Sample date" type="date" defaultValue="2026-10-01" className="osio-field px-2.5 text-sm" />
        <Dropdown label="Sample stage" width={160} value={stage} options={STAGES} onChange={setStage} />
      </div>
    </div>
  );
};
