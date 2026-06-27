/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConnectionOnboarding.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { Check, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

import { Modal } from "@/shared/ui/primitives/Modal";
import { useConnectorStore } from "@/features/connectors/model/useConnectorStore";
import { FUNCTIONAL_CONNECTORS } from "@/features/connectors/model/connectorRegistry";

const SCOPE_LABELS: Record<string, string> = {
  profile: "Read your basic profile",
  "models:read": "List the models available to you",
  "chat:write": "Send messages to the assistant on your behalf",
  "chat:read": "Read this assistant's conversations",
};

/** Guided "set up a connection" flow shown when you try to chat without one.
 *  The parent remounts this (via `key`) on each open, so `initialStep` seeds
 *  the local step directly — no reset effect needed. */
export const ConnectionOnboarding: React.FC<{
  open: boolean;
  initialStep?: "ask" | "choose";
  onClose: () => void;
  onConnected?: () => void;
}> = ({ open, initialStep = "ask", onClose, onConnected }) => {
  const [step, setStep] = useState<"ask" | "choose">(initialStep);
  const snapshots = useConnectorStore((s) => s.snapshots);
  const connect = useConnectorStore((s) => s.connect);

  const handleConnect = async (providerKey: string) => {
    await connect(providerKey);
    if (useConnectorStore.getState().snapshots[providerKey]?.state === "connected") onConnected?.();
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect the assistant">
      {step === "ask" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--osio-fg-default)]">
            You&apos;re trying to talk to the AI, but you haven&apos;t set up a connection yet.
          </p>
          <p className="text-sm text-[var(--osio-fg-muted)]">Do you want to set up a connection now?</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">
              Not now
            </button>
            <button type="button" onClick={() => setStep("choose")} className="rounded-lg bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] hover:bg-[var(--osio-accent-hover,var(--osio-accent))]">
              Yes, connect
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--osio-fg-muted)]">Which provider do you want to connect with?</p>
          {FUNCTIONAL_CONNECTORS.map((d) => {
            const state = snapshots[d.providerKey]?.state ?? "disconnected";
            const error = snapshots[d.providerKey]?.error?.message;
            return (
              <div key={d.providerKey} className="rounded-xl border border-[var(--osio-border-default)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--osio-fg-default)]">{d.displayName}</div>
                    <div className="text-xs text-[var(--osio-fg-subtle)]">
                      {d.authStrategy === "oauth" ? "Sign in — no API key needed" : "Uses ANTHROPIC_API_KEY configured on the server"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleConnect(d.providerKey)}
                    disabled={state === "connecting" || state === "connected"}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
                      state === "connected"
                        ? "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-muted)]"
                        : "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] hover:bg-[var(--osio-accent-hover,var(--osio-accent))]"
                    }`}
                  >
                    {state === "connecting" ? <Loader2 size={14} className="animate-spin" />
                      : state === "connected" ? <Check size={14} />
                      : state === "error" ? <TriangleAlert size={14} /> : null}
                    {state === "connected" ? "Connected" : state === "connecting" ? "Connecting…" : state === "error" ? "Retry" : "Connect"}
                  </button>
                </div>
                {d.scopes?.length ? (
                  <ul className="mt-2 flex flex-col gap-1">
                    {d.scopes.map((scope) => (
                      <li key={scope} className="flex items-center gap-2 text-xs text-[var(--osio-fg-muted)]">
                        <ShieldCheck size={13} className="shrink-0 text-[var(--osio-accent)]" />
                        {SCOPE_LABELS[scope] ?? scope}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {state === "error" && error ? <p className="mt-2 text-xs text-[var(--osio-danger)]">{error}</p> : null}
              </div>
            );
          })}
          <p className="text-xs text-[var(--osio-fg-subtle)]">
            Lost later? You can connect or manage providers anytime from the <strong>Connect</strong> button in the
            composer, or the &quot;Get better answers from your apps&quot; bar under it.
          </p>
        </div>
      )}
    </Modal>
  );
};
