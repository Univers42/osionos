import React from "react";

import { CONTROL_HEIGHT_TOKENS, SPACE_TOKENS } from "../styleGuideData";
import { StyleGuideSection, TokenLabel } from "./StyleGuideSection";

export const DensitySection: React.FC = () => (
  <StyleGuideSection title="Density">
    <h3 className="text-xs font-medium text-[var(--osio-fg-muted)]">Control heights</h3>
    <div className="flex flex-wrap items-end gap-4">
      {CONTROL_HEIGHT_TOKENS.map((token) => (
        <div key={token} className="flex min-w-0 flex-col gap-1">
          <div
            data-token={token}
            className="w-24 shrink-0 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-muted)]"
            style={{ height: `var(${token})` }}
          />
          <TokenLabel token={token} />
        </div>
      ))}
    </div>
    <h3 className="text-xs font-medium text-[var(--osio-fg-muted)]">Spacing</h3>
    <div className="flex flex-col gap-2">
      {SPACE_TOKENS.map((token) => (
        <div key={token} className="flex min-w-0 items-center gap-3">
          <div
            data-token={token}
            className="h-3 shrink-0 rounded-sm bg-[var(--osio-accent)]"
            style={{ width: `var(${token})` }}
          />
          <TokenLabel token={token} />
        </div>
      ))}
    </div>
  </StyleGuideSection>
);
