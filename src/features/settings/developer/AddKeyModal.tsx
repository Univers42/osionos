/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AddKeyModal.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The add-key dialog. The pasted key lives in this component's state only: closing the
// dialog unmounts it and the text is gone. Client-side it trims and refuses an obvious
// private-key paste; the bridge decides everything else and its answer is shown as is.

import React, { useId, useState } from "react";

import { Button, Input, Modal } from "@/shared/ui";

import { addKey, addKeyBody, failureOf, looksPrivate, type AccountKey, type KeyKind } from "./keysApi";

const labelClass = "block text-sm font-medium text-[var(--osio-fg-default)]";
const hintClass = "text-sm leading-[18px] text-[var(--osio-fg-muted)]";
const FIELD_CLASS = "w-full rounded-[var(--osio-field-radius)] border border-[var(--osio-field-border)] bg-[var(--osio-field-bg)] px-2.5 py-2 font-mono text-xs text-[var(--osio-fg-default)] focus-visible:border-[var(--osio-field-border-focus)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]";
const PRIVATE_PASTE = "That looks like a private key. Paste the public key instead; a private key never leaves your machine.";
const KIND_COPY: Record<KeyKind, { label: string; placeholder: string; hint: string }> = {
  ssh: { label: "SSH key", placeholder: "ssh-ed25519 AAAA… (one line from your .pub file)", hint: "Paste the contents of your .pub file, for example ~/.ssh/id_ed25519.pub." },
  gpg: { label: "GPG key", placeholder: "-----BEGIN PGP PUBLIC KEY BLOCK-----", hint: "Paste the output of gpg --armor --export <key id>." },
};

export const AddKeyModal: React.FC<{ onClose: () => void; onAdded: (key: AccountKey) => void }> = ({ onClose, onAdded }) => {
  const [kind, setKind] = useState<KeyKind>("ssh");
  const [title, setTitle] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const titleId = useId();
  const keyId = useId();
  const body = addKeyBody(kind, title, publicKey);
  const privatePaste = looksPrivate(publicKey);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body || pending) return;
    setPending(true);
    setFailure(null);
    try {
      onAdded(await addKey(body));
      onClose();
    } catch (error) {
      setFailure(failureOf(error));
      setPending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add a public key" description="Only public keys are accepted. Your private key stays on your machine." size="md">
      <form onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-1">
          <legend className={labelClass}>Kind</legend>
          {(Object.keys(KIND_COPY) as KeyKind[]).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-[var(--osio-fg-default)]">
              <input type="radio" name="key-kind" checked={kind === option} onChange={() => setKind(option)} className="accent-[var(--osio-accent)]" />
              {KIND_COPY[option].label}
            </label>
          ))}
        </fieldset>
        <div className="space-y-1">
          <label htmlFor={titleId} className={labelClass}>Title</label>
          <Input id={titleId} value={title} maxLength={80} placeholder="Work laptop" onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor={keyId} className={labelClass}>Public key</label>
          <textarea
            id={keyId} rows={6} className={FIELD_CLASS} value={publicKey} spellCheck={false} autoComplete="off" autoCapitalize="off"
            placeholder={KIND_COPY[kind].placeholder} aria-invalid={privatePaste || undefined}
            onChange={(event) => setPublicKey(event.target.value)}
          />
          <p className={hintClass}>{KIND_COPY[kind].hint}</p>
        </div>
        {privatePaste && <p role="alert" className="text-sm text-[var(--osio-danger)]">{PRIVATE_PASTE}</p>}
        {failure && <p role="alert" className="text-sm text-[var(--osio-danger)]">{failure}</p>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" tone="primary" disabled={!body || pending}>{pending ? "Adding…" : "Add key"}</Button>
        </div>
      </form>
    </Modal>
  );
};
