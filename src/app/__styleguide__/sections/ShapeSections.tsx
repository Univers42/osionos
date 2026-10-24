import React from "react";

import { ELEVATION_TOKENS, RADIUS_TOKENS } from "../styleGuideData";
import { StyleGuideSection, TokenLabel } from "./StyleGuideSection";

export const RadiusSection: React.FC = () => (
  <StyleGuideSection title="Radius">
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {RADIUS_TOKENS.map((token) => (
        <div key={token} className="flex min-w-0 flex-col gap-1">
          <div
            data-token={token}
            className="h-16 border border-[var(--osio-border-default)] bg-[var(--osio-bg-muted)]"
            style={{ borderRadius: `var(${token})` }}
          />
          <TokenLabel token={token} />
        </div>
      ))}
    </div>
  </StyleGuideSection>
);

export const ElevationSection: React.FC = () => (
  <StyleGuideSection title="Elevation">
    <div className="grid grid-cols-2 gap-4 p-2 sm:grid-cols-3 lg:grid-cols-5">
      {ELEVATION_TOKENS.map((token) => (
        <div key={token} className="flex min-w-0 flex-col gap-1">
          <div
            data-token={token}
            className="h-16 rounded-md bg-[var(--osio-bg-surface)]"
            style={{ boxShadow: `var(${token})` }}
          />
          <TokenLabel token={token} />
        </div>
      ))}
    </div>
  </StyleGuideSection>
);
