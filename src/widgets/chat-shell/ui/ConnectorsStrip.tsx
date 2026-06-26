/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConnectorsStrip.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Check, Loader2, Plug, TriangleAlert } from "lucide-react";

import { useConnectorStore } from "@/features/connectors/model/useConnectorStore";
import { FUNCTIONAL_CONNECTORS, PLACEHOLDER_CONNECTORS } from "@/features/connectors/model/connectorRegistry";
import type { ConnectorDescriptor } from "@/features/connectors/model/connectorTypes";
import { ConnectorConsentModal } from "./ConnectorConsentModal";

/** "Get better answers from your apps" — connect/disconnect connectors that feed the picker. */
export const ConnectorsStrip: React.FC = () => {
  const snapshots = useConnectorStore((s) => s.snapshots);
  const connect = useConnectorStore((s) => s.connect);
  const disconnect = useConnectorStore((s) => s.disconnect);
  const [consentFor, setConsentFor] = useState<ConnectorDescriptor | null>(null);

  const onChip = (d: ConnectorDescriptor, connected: boolean) => {
    if (connected) return void disconnect(d.providerKey);
    // OAuth: show scopes first (no key). Env-token: probe the bridge directly.
    if (d.authStrategy === "oauth") setConsentFor(d);
    else void connect(d.providerKey);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-[var(--osio-fg-subtle)]">Get better answers from your apps</span>
      {FUNCTIONAL_CONNECTORS.map((d) => {
        const snap = snapshots[d.providerKey];
        const state = snap?.state ?? "disconnected";
        const connected = state === "connected";
        return (
          <button
            key={d.providerKey}
            type="button"
            title={state === "error" ? snap?.error?.message : connected ? "Disconnect" : `Connect ${d.displayName}`}
            onClick={() => onChip(d, connected)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              connected
                ? "border-[var(--osio-accent)] text-[var(--osio-accent-text,var(--osio-accent))]"
                : "border-[var(--osio-border-default)] text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
            }`}
          >
            {state === "connecting" ? <Loader2 size={13} className="animate-spin" />
              : connected ? <Check size={13} />
              : state === "error" ? <TriangleAlert size={13} className="text-[var(--osio-danger)]" />
              : <Plug size={13} />}
            {d.displayName}
          </button>
        );
      })}
      {PLACEHOLDER_CONNECTORS.map((d) => (
        <span
          key={d.providerKey}
          title="Available to connect (coming soon)"
          className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-dashed border-[var(--osio-border-default)] px-2.5 py-1 text-xs text-[var(--osio-fg-subtle)]"
        >
          {d.displayName}
        </span>
      ))}

      <ConnectorConsentModal
        descriptor={consentFor}
        onAuthorize={() => { const d = consentFor; setConsentFor(null); if (d) void connect(d.providerKey); }}
        onClose={() => setConsentFor(null)}
      />
    </div>
  );
};
