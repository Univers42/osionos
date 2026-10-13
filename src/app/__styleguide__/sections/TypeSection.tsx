import React from "react";

import { StyleGuideSection } from "./StyleGuideSection";

export const TypeSection: React.FC = () => (
  <StyleGuideSection title="Typography">
    <div className="space-y-2" style={{ fontFamily: "var(--osio-font-family-serif)" }}>
      <p className="text-3xl font-bold text-[var(--osio-fg-strong)]">Heading one</p>
      <p className="text-2xl font-semibold text-[var(--osio-fg-strong)]">Heading two</p>
      <p className="text-xl font-semibold text-[var(--osio-fg-default)]">Heading three</p>
      <p
        className="text-sm leading-6 text-[var(--osio-fg-default)]"
        style={{ fontFamily: "var(--osio-font-family-sans)" }}
      >
        Body copy in the sans family.{" "}
        <a className="text-[var(--osio-accent-text)] underline" href="#">
          An accent link
        </a>{" "}
        stays AA-safe.
      </p>
      <code
        className="block rounded-md bg-[var(--osio-bg-muted)] px-2 py-1 text-xs text-[var(--osio-fg-default)]"
        style={{ fontFamily: "var(--osio-font-family-mono)" }}
      >
        {'const mono = "code";'}
      </code>
    </div>
  </StyleGuideSection>
);
