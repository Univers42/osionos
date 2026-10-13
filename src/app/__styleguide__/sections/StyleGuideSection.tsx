import React, { useId } from "react";

export interface StyleGuideSectionProps {
  title: string;
  children: React.ReactNode;
}

export const StyleGuideSection: React.FC<StyleGuideSectionProps> = ({ title, children }) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3">
      <h2 id={headingId} className="text-sm font-semibold text-[var(--osio-fg-strong)]">{title}</h2>
      {children}
    </section>
  );
};

export const TokenLabel: React.FC<{ token: string }> = ({ token }) => (
  <code className="break-all text-xs text-[var(--osio-fg-subtle)]">{token}</code>
);
