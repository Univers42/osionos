/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   KeysSection.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Settings > Developer > SSH and GPG keys: the owner's public keys, listed with their
// fingerprints. Add and delete need the sudo window the token panel uses, so a refusal
// opens the shared sudo prompt and the person presses the button again.
//
// Caveat: this list is the account's record. Keys are not pushed to an IDE sandbox from
// here; a running workspace does not learn about an add or a delete.

import React, { useEffect, useState } from "react";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";

import { Button, IconButton } from "@/shared/ui";
import { ConfirmModal } from "@/features/settings/ui/ConfirmModals";
import { DataTable, EmptyState, PanelStatus, Section, SettingRow, type PanelStatusState } from "@/features/settings/ui/settingsKit";

import { AddKeyModal } from "./AddKeyModal";
import { deleteKey, failureOf, listKeys, type AccountKey } from "./keysApi";
import { dateLabel } from "./patModel";

const HEADERS = ["Title", "Kind", "Fingerprint", "Added", "Actions"];

const FingerprintCell: React.FC<{ keyEntry: AccountKey }> = ({ keyEntry }) => {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(keyEntry.fingerprint);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <span className="flex items-center gap-1">
      <code className="break-all text-xs">{keyEntry.fingerprint}</code>
      <IconButton label={`Copy fingerprint of ${keyEntry.title}`} onClick={() => void copy()}><Copy size={14} /></IconButton>
      <span role="status" className="text-xs text-[var(--osio-fg-muted)]">{copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : ""}</span>
    </span>
  );
};

export const KeysSection: React.FC = () => {
  const [status, setStatus] = useState<PanelStatusState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<AccountKey[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AccountKey | null>(null);

  useEffect(() => {
    let live = true;
    listKeys().then(
      (loaded) => { if (live) { setKeys(loaded); setStatus("ready"); } },
      (failure: unknown) => { if (live) { setError(failureOf(failure)); setStatus("error"); } },
    );
    return () => { live = false; };
  }, [attempt]);

  function retry() {
    setStatus("loading");
    setAttempt((count) => count + 1);
  }

  // The dialog rethrows with the friendly copy so it stays open and shows it.
  async function removeKey(target: AccountKey) {
    try {
      await deleteKey(target.id);
    } catch (failure) {
      throw new Error(failureOf(failure));
    }
    setKeys((current) => current.filter((item) => item.id !== target.id));
  }

  const rows = keys.map((item) => [
    <span key={item.id} className="block truncate font-medium">{item.title}</span>,
    item.kind === "ssh" ? "SSH" : "GPG",
    <FingerprintCell key="fingerprint" keyEntry={item} />,
    dateLabel(item.createdAt),
    <IconButton key="delete" label={`Delete ${item.title}`} tone="danger" onClick={() => setPendingDelete(item)}><Trash2 size={16} /></IconButton>,
  ]);

  return (
    <Section title="SSH and GPG keys" anchor="ssh-gpg-keys">
      <SettingRow
        title="Public keys only"
        description="Save the public half of the keys you use for git over SSH or for signing commits. A private key is refused and never stored. Adding or deleting a key asks you to confirm it is you."
        action={<Button tone="primary" onClick={() => setAdding(true)} disabled={status !== "ready"}><Plus size={16} />Add key</Button>}
      />
      <PanelStatus status={status} error={error} onRetry={retry}>
        {keys.length === 0 ? (
          <EmptyState icon={<KeyRound size={16} />} title="No SSH or GPG keys yet." hint="Add a public key to keep a record of the keys that sign as you." />
        ) : (
          <DataTable headers={HEADERS} rows={rows} />
        )}
      </PanelStatus>
      {adding && <AddKeyModal onClose={() => setAdding(false)} onAdded={(added) => setKeys((current) => [added, ...current])} />}
      {pendingDelete && (
        <ConfirmModal
          title="Delete key"
          message={`Delete ${pendingDelete.title}? Anything that relied on this key, such as signature checks, stops trusting it.`}
          actionLabel="Delete"
          danger
          onConfirm={() => removeKey(pendingDelete)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </Section>
  );
};
