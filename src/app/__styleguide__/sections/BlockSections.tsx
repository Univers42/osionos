import React from "react";
import { Bell } from "lucide-react";

import { Badge } from "@/shared/ui";
import { StyleGuideSection } from "./StyleGuideSection";

function CalloutMock() {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-[var(--osio-border-default)] px-3 py-2"
      style={{ backgroundColor: "var(--osio-block-tint-blue-bg)", color: "var(--osio-block-tint-blue-fg)" }}
    >
      <Bell size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
      <p className="text-sm leading-6">An admonition callout, tinted with the blue block token.</p>
    </div>
  );
}

function CodeBlockMock() {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--osio-border-default)]">
      <div className="flex items-center justify-between bg-[var(--osio-bg-muted)] px-3 py-1.5">
        <span
          className="text-xs text-[var(--osio-fg-muted)]"
          style={{ fontFamily: "var(--osio-font-family-mono)" }}
        >
          app.ts
        </span>
        <Badge tone="accent">TS</Badge>
      </div>
      <pre
        className="bg-[var(--osio-bg-surface)] px-3 py-2 text-xs text-[var(--osio-fg-default)]"
        style={{ fontFamily: "var(--osio-font-family-mono)" }}
      >
        {`export const ok = true;`}
      </pre>
    </div>
  );
}

export const BlockSections: React.FC = () => (
  <StyleGuideSection title="Callout and code">
    <div className="space-y-3">
      <CalloutMock />
      <CodeBlockMock />
    </div>
  </StyleGuideSection>
);
