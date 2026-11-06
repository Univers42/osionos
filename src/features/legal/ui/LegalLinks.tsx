import React from "react";

import { LEGAL_LINKS } from "../model/siteLegalLinks";

/** The Privacy Policy and Terms of Service links, each opening the public site in a new tab. */
export const LegalLinks: React.FC<{ className?: string }> = ({ className }) => {
  if (LEGAL_LINKS.length === 0) return null;
  return (
    <nav aria-label="Legal" className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--osio-fg-muted)] ${className ?? ""}`}>
      {LEGAL_LINKS.map((link) => (
        <a
          key={link.id}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm hover:text-[var(--osio-fg-default)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
};
