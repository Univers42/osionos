/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeBottomStrip.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { SquareTerminal, X } from "lucide-react";

// Lazy so xterm.js (~250KB) loads only when the terminal panel first opens.
const IdeTerminal = React.lazy(() =>
  import("@/features/ide/ui/IdeTerminal").then((m) => ({ default: m.IdeTerminal })),
);

/** The collapsible bottom strip: a real xterm.js terminal over the sandbox PTY
 *  (P3), or the "sandbox off" hint when the transport is unavailable. */
export const IdeBottomStrip: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <section
      aria-label="Terminal"
      data-code-theme="dark"
      className="flex h-52 shrink-0 flex-col border-t border-[var(--osio-code-border)] bg-[var(--osio-code-bg)]"
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--osio-code-border)] px-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--osio-code-fg-muted)]">
        <SquareTerminal size={13} /> Terminal
        <span className="flex-1" />
        <button
          type="button"
          title="Hide panel"
          aria-label="Hide panel"
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.12))] hover:text-[var(--osio-code-fg)]"
        >
          <X size={13} />
        </button>
      </div>
      <React.Suspense
        fallback={
          <div className="min-h-0 flex-1 px-3 py-2 font-mono text-[12px] leading-5 text-[var(--osio-code-fg-muted)]">
            Starting terminal…
          </div>
        }
      >
        <IdeTerminal />
      </React.Suspense>
    </section>
  );
};
