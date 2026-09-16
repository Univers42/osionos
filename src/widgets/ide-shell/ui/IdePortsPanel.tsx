/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdePortsPanel.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { ExternalLink } from "lucide-react";

import { useUserStore } from "@/features/auth";
import { fetchSandboxPorts, openPortPreview, type SandboxPort } from "@/features/ide/model/idePorts";

const POLL_MS = 5000;

/** The dock's PORTS tab: TCP listeners inside the sandbox, refreshed while the
 *  tab is open. List-only and honest about it — the sandbox network is
 *  internal, so forwarding to the browser is a later session-proxy feature. */
export const IdePortsPanel: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const [ports, setPorts] = React.useState<SandboxPort[] | null>(null);

  React.useEffect(() => {
    if (!workspaceId) return;
    let disposed = false;
    const refresh = async () => {
      const next = await fetchSandboxPorts(workspaceId);
      if (!disposed) setPorts(next);
    };
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => { disposed = true; clearInterval(timer); };
  }, [workspaceId]);

  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12px] leading-6 text-[var(--osio-code-fg)]">
      {ports === null && <p className="py-4 text-center text-[var(--osio-code-fg-muted)]">Checking sandbox listeners…</p>}
      {ports?.length === 0 && (
        <p className="py-4 text-center text-[var(--osio-code-fg-muted)]">
          Nothing listening in the sandbox. Start a server in the terminal and it appears here.
        </p>
      )}
      {(ports ?? []).map((entry) => (
        <div key={entry.port} className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-right font-semibold text-[var(--osio-accent)]">{entry.port}</span>
          <span className="min-w-0 flex-1 truncate text-[var(--osio-code-fg-muted)]">{entry.address}</span>
          <button
            type="button"
            title={`Open a preview of port ${entry.port}`}
            onClick={() => void openPortPreview(workspaceId, entry.port)}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--osio-code-border)] px-1.5 py-0.5 text-[11px] text-[var(--osio-code-fg)] hover:bg-[var(--osio-code-btn-hover)]"
          >
            <ExternalLink size={11} /> Open
          </button>
        </div>
      ))}
      {(ports?.length ?? 0) > 0 && (
        <p className="mt-3 text-[11px] text-[var(--osio-code-fg-muted)]">
          Preview rides the isolated exec channel: GET-only, 2 MiB cap, no websockets yet — live-reload dev servers render but do not hot-update.
        </p>
      )}
    </div>
  );
};
