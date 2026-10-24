import React from "react";

import { StyleGuideSection } from "./StyleGuideSection";

/* The samples are <p>, not <h1-4>: a real heading here would join the page outline. */

export const TypeSection: React.FC = () => (
  <StyleGuideSection title="Typography">
    <div className="space-y-3">
      <div>
        <p className="osio-display text-display text-[var(--osio-fg-strong)]">
          Display title
        </p>
        <span className="text-2xs text-[var(--osio-fg-subtle)]">display - Newsreader 600, --osio-font-size-display</span>
      </div>
      <p className="osio-h1 text-[var(--osio-fg-strong)]">Heading one</p>
      <p className="osio-h2 text-[var(--osio-fg-strong)]">Heading two</p>
      <p className="osio-h3 text-[var(--osio-fg-default)]">Heading three</p>
      <p className="osio-h4 text-[var(--osio-fg-default)]">Heading four</p>
      <p className="text-sm leading-6 text-[var(--osio-fg-default)]">
        Body copy in the interface family.{" "}
        <a className="text-[var(--osio-accent-text)] underline" href="#">
          An accent link
        </a>{" "}
        stays AA-safe.
      </p>
      <p className="text-2xs text-[var(--osio-fg-muted)]">2xs (11px): badges and dense metadata</p>
      <p className="text-3xs text-[var(--osio-fg-muted)]">3xs (10px): avatar initials and counters</p>
      <code
        className="block rounded-md bg-[var(--osio-bg-muted)] px-2 py-1 text-xs text-[var(--osio-fg-default)]"
        style={{ fontFamily: "var(--osio-font-family-mono)" }}
      >
        {'const mono = "code";'}
      </code>
    </div>
  </StyleGuideSection>
);
