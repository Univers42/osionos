/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CreateTokenModal.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The create dialog. Its two screens (the form, then the one-time secret) share one
// component so the secret exists in exactly one place: this component's state.
// Closing the dialog unmounts it and the secret is gone; nothing else ever holds it.
//
// Caveat: the browser may keep the secret in the clipboard after Copy, and in a
// password manager that offers to save the read-only field; neither is ours to clear.

import React, { useId, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button, Input, Modal } from "@/shared/ui";

import { createToken } from "./patApi";
import {
  EXPIRY_PRESET_DAYS, MCP_PRESET, attributesOf, classicScopes, createTokenBody, expiryFromDays, maxExpiryDate,
  patErrorMessage, presetWriteAttributes, scopeLabel, type PatCatalog, type PatKind, type PatToken, type TokenForm,
} from "./patModel";
import { PermissionPicker } from "./PermissionPicker";

const labelClass = "block text-sm font-medium text-[var(--osio-fg-default)]";
const hintClass = "text-sm leading-[18px] text-[var(--osio-fg-muted)]";

function initialForm(catalog: PatCatalog): TokenForm {
  return { name: "", kind: "classic", expiry: expiryFromDays(30), scopes: [], resource: Object.keys(catalog.resources)[0] ?? "", attributes: [], permissions: [] };
}

function failureOf(error: unknown): string {
  const code = typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : undefined;
  return patErrorMessage(code, error instanceof Error ? error.message : "");
}

const SecretView: React.FC<{ secret: string; onClose: () => void }> = ({ secret, onClose }) => {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm font-medium text-[var(--osio-fg-default)]">Copy it now — it is not shown again.</p>
      <div className="flex gap-2">
        <Input readOnly aria-label="Your new token" value={secret} onFocus={(event) => event.currentTarget.select()} className="font-mono" />
        <Button onClick={copy} aria-label="Copy token">{copied === "done" ? <Check size={16} /> : <Copy size={16} />}{copied === "done" ? "Copied" : "Copy"}</Button>
      </div>
      {copied === "failed" && <p role="alert" className="text-sm text-[var(--osio-danger)]">Copy failed. Select the token and copy it by hand.</p>}
      <p className={hintClass}>Set it as <code>OSIONOS_MCP_TOKEN</code> in the environment of the app that will use it; do not paste it into a file you commit.</p>
      <div className="flex justify-end"><Button tone="primary" onClick={onClose}>Done</Button></div>
    </div>
  );
};

export const CreateTokenModal: React.FC<{ catalog: PatCatalog; onClose: () => void; onCreated: (token: PatToken) => void }> = ({ catalog, onClose, onCreated }) => {
  const [form, setForm] = useState<TokenForm>(() => initialForm(catalog));
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const nameId = useId();
  const expiryId = useId();
  const body = createTokenBody(form);
  const offered = classicScopes(catalog);
  const presetAvailable = MCP_PRESET.scopes.every((scope) => offered.includes(scope));
  const presetFields = presetWriteAttributes(MCP_PRESET, catalog);
  const patch = (next: Partial<TokenForm>) => setForm((current) => ({ ...current, ...next }));

  // Fills the form only: the user reads what it grants and presses Create.
  const applyPreset = () => patch({ name: MCP_PRESET.name, kind: MCP_PRESET.kind, scopes: [...MCP_PRESET.scopes], expiry: expiryFromDays(MCP_PRESET.expiryDays) });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body || pending) return;
    setPending(true);
    setFailure(null);
    try {
      const created = await createToken(body);
      onCreated(created.token);
      setSecret(created.secret);
    } catch (error) {
      setFailure(failureOf(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={secret ? "Token created" : "New personal access token"} description={secret ? "Store this token somewhere safe." : "A token lets an app act as you, with only the permissions you pick."} size="md">
      {secret ? <SecretView secret={secret} onClose={onClose} /> : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Button onClick={applyPreset} disabled={!presetAvailable}>osionos MCP (Claude Code)</Button>
            <p className={hintClass}>
              Fills in a 30-day token that reads and writes pages. Write includes archiving pages
              {presetFields.length > 0 ? `, and it can change: ${presetFields.join(", ")}.` : "."}
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor={nameId} className={labelClass}>Name</label>
            <Input id={nameId} value={form.name} maxLength={64} placeholder="CI pipeline" onChange={(event) => patch({ name: event.target.value })} />
          </div>
          <fieldset className="space-y-1">
            <legend className={labelClass}>Kind</legend>
            {(["classic", "fine_grained"] as PatKind[]).map((kind) => (
              <label key={kind} className="flex items-center gap-2 text-sm text-[var(--osio-fg-default)]">
                <input type="radio" name="token-kind" checked={form.kind === kind} onChange={() => patch({ kind })} className="accent-[var(--osio-accent)]" />
                {kind === "classic" ? "Classic — pick scopes" : "Fine-grained — pick fields and access"}
              </label>
            ))}
          </fieldset>
          <PermissionPicker form={form} catalog={catalog} onChange={patch} classicScopes={classicScopes(catalog)} attributes={attributesOf(catalog, form.resource)} scopeLabel={scopeLabel} />
          <div className="space-y-1">
            <label htmlFor={expiryId} className={labelClass}>Expires on</label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id={expiryId} type="date" required value={form.expiry} min={expiryFromDays(1)} max={maxExpiryDate()} onChange={(event) => patch({ expiry: event.target.value })} className="w-auto" />
              {EXPIRY_PRESET_DAYS.map((days) => <Button key={days} onClick={() => patch({ expiry: expiryFromDays(days) })}>{days} days</Button>)}
            </div>
            <p className={hintClass}>Required, at most a year out. The token stops working at 00:00 UTC on this date.</p>
          </div>
          {failure && <p role="alert" className="text-sm text-[var(--osio-danger)]">{failure}</p>}
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" tone="primary" disabled={!body || pending}>{pending ? "Creating…" : "Create token"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
};
