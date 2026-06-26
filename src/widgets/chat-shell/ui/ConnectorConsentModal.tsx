/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConnectorConsentModal.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ShieldCheck } from "lucide-react";

import { Modal } from "@/shared/ui/primitives/Modal";
import type { ConnectorDescriptor } from "@/features/connectors/model/connectorTypes";

const SCOPE_LABELS: Record<string, string> = {
  profile: "Read your basic profile",
  "models:read": "List the models available to you",
  "chat:write": "Send messages to the assistant on your behalf",
  "chat:read": "Read this assistant's conversations",
};

/** OAuth consent — scopes shown BEFORE redirect (§7). No API key required. */
export const ConnectorConsentModal: React.FC<{
  descriptor: ConnectorDescriptor | null;
  onAuthorize: () => void;
  onClose: () => void;
}> = ({ descriptor, onAuthorize, onClose }) => (
  <Modal open={Boolean(descriptor)} onClose={onClose} title={descriptor ? `Connect ${descriptor.displayName}` : ""}>
    {descriptor ? (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--osio-fg-muted)]">
          You&apos;ll authorize via the provider — <strong>no API key required</strong>. {descriptor.displayName} will be able to:
        </p>
        <ul className="flex flex-col gap-1.5">
          {(descriptor.scopes ?? []).map((scope) => (
            <li key={scope} className="flex items-center gap-2 text-sm text-[var(--osio-fg-default)]">
              <ShieldCheck size={15} className="shrink-0 text-[var(--osio-accent)]" />
              {SCOPE_LABELS[scope] ?? scope}
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]">
            Cancel
          </button>
          <button
            type="button"
            onClick={onAuthorize}
            className="rounded-lg bg-[var(--osio-accent)] px-3 py-1.5 text-sm font-medium text-[var(--osio-accent-fg)] hover:bg-[var(--osio-accent-hover,var(--osio-accent))]"
          >
            Authorize
          </button>
        </div>
      </div>
    ) : null}
  </Modal>
);
