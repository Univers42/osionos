import React from "react";

import {
  ACCENT_SWATCHES,
  BLOCK_TINTS,
  STATUS_SWATCHES,
  SURFACE_SWATCHES,
  TEXT_SWATCHES,
  type Swatch,
} from "../styleGuideData";
import { StyleGuideSection, TokenLabel } from "./StyleGuideSection";

function Chip({ token, kind }: Swatch) {
  const isFg = kind === "fg";
  const style = isFg ? { color: `var(${token})` } : { backgroundColor: `var(${token})` };
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        data-token={token}
        className="h-12 rounded-md border border-[var(--osio-border-default)]"
        style={isFg ? undefined : style}
      >
        {isFg ? (
          <span className="px-2 py-1 text-sm font-medium" style={style}>
            Aa
          </span>
        ) : null}
      </div>
      <TokenLabel token={token} />
    </div>
  );
}

function SwatchGrid({ items }: { items: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((swatch) => (
        <Chip key={swatch.token} {...swatch} />
      ))}
    </div>
  );
}

function TintRow() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {BLOCK_TINTS.map((name) => (
        <div
          key={name}
          data-tint={name}
          className="min-w-0 rounded-md border border-[var(--osio-border-default)] px-2 py-1.5 text-xs font-medium"
          style={{
            backgroundColor: `var(--osio-block-tint-${name}-bg)`,
            color: `var(--osio-block-tint-${name}-fg)`,
          }}
        >
          {name}
        </div>
      ))}
    </div>
  );
}

export const ColorSections: React.FC = () => (
  <>
    <StyleGuideSection title="Surfaces">
      <SwatchGrid items={SURFACE_SWATCHES} />
    </StyleGuideSection>
    <StyleGuideSection title="Text">
      <SwatchGrid items={TEXT_SWATCHES} />
    </StyleGuideSection>
    <StyleGuideSection title="Accent">
      <SwatchGrid items={ACCENT_SWATCHES} />
    </StyleGuideSection>
    <StyleGuideSection title="Border and status">
      <SwatchGrid items={STATUS_SWATCHES} />
    </StyleGuideSection>
    <StyleGuideSection title="Block tints">
      <TintRow />
    </StyleGuideSection>
  </>
);
