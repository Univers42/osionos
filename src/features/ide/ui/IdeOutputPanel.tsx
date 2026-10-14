/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeOutputPanel.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { useIdeOutputBus } from "@/features/ide/model/ideOutputBus";

/** The dock's OUTPUT tab: infrastructure logs (fs-sync, terminal lifecycle,
 *  sync conflicts, runner) with channel prefixes. Auto-follows the tail. */
export const IdeOutputPanel: React.FC = () => {
  const lines = useIdeOutputBus((s) => s.lines);
  const clear = useIdeOutputBus((s) => s.clear);
  const endRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-end border-b border-[var(--osio-code-border)] px-2">
        <button type="button" onClick={clear} className="osio-code-btn h-6 px-2 text-xs">
          Clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-1 font-mono text-xs leading-5 text-[var(--osio-code-fg)]">
        {lines.length === 0 && <p className="osio-code-empty">No output yet — sync, terminal and runner events land here.</p>}
        {lines.map((line, index) => (
          <div key={index} className="whitespace-pre-wrap break-all">
            <span className="text-[var(--osio-code-fg-muted)]">[{line.channel}] </span>
            {line.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};
