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

import { Tooltip } from "@/shared/ui";
import { useUserStore } from "@/features/auth";
import { fetchSandboxPorts, openPortPreview, type SandboxPort } from "@/features/ide/model/idePorts";
import { isSandboxOnline, useSandboxHealthStore } from "@/features/ide/model/sandboxHealthStore";
import { SandboxUnavailable } from "./SandboxUnavailable";

// Ponytail: fixed 5 s interval — a slow response can overlap the next tick and
// land out of order; harmless for a listener list. Runs only while health is online.
const POLL_MS = 5000;

/** The dock's PORTS tab: TCP listeners inside the sandbox, refreshed while the
 *  tab is open. List-only and honest about it — the sandbox network is
 *  internal, so forwarding to the browser is a later session-proxy feature. */
export const IdePortsPanel: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const [ports, setPorts] = React.useState<SandboxPort[] | null>(null);
  const healthState = useSandboxHealthStore((s) => s.state);
  const online = isSandboxOnline(healthState);

  React.useEffect(() => {
    if (!workspaceId || !online) return;
    let disposed = false;
    const refresh = async () => {
      const next = await fetchSandboxPorts(workspaceId);
      if (!disposed) setPorts(next);
    };
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => { disposed = true; clearInterval(timer); };
  }, [workspaceId, online]);

  return (
    <div className="min-h-0 flex-1 overflow-auto py-1 text-xs">
      {!online && healthState !== "unknown" && <SandboxUnavailable compact />}
      {!online && healthState === "unknown" && <p className="osio-code-empty">Checking sandbox…</p>}
      {online && ports === null && <p className="osio-code-empty">Checking sandbox listeners…</p>}
      {online && ports?.length === 0 && (
        <p className="osio-code-empty">Nothing listening in the sandbox. Start a server in the terminal and it appears here.</p>
      )}
      {(online ? (ports ?? []) : []).map((entry) => (
        <div key={entry.port} className="flex min-h-7 items-center gap-3 px-3 hover:bg-[var(--osio-code-btn-hover)]">
          <span className="w-14 shrink-0 text-right font-mono font-semibold tabular-nums text-[var(--osio-code-caret)]">{entry.port}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[var(--osio-code-fg-muted)]">{entry.address}</span>
          <Tooltip label={`Open a preview of port ${entry.port}`} side="left">
            <button
              type="button"
              data-tone="accent"
              onClick={() => void openPortPreview(workspaceId, entry.port)}
              className="osio-code-btn h-6 shrink-0 px-2 text-xs"
            >
              <ExternalLink size={12} aria-hidden /> Open
            </button>
          </Tooltip>
        </div>
      ))}
      {online && (ports?.length ?? 0) > 0 && (
        <p className="px-3 pb-2 pt-3 text-2xs leading-5 text-[var(--osio-code-fg-muted)]">
          Preview rides the isolated exec channel: GET-only, 2 MiB cap, no websockets yet — live-reload dev servers render but do not hot-update.
        </p>
      )}
    </div>
  );
};
