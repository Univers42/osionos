/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CreateKeyModal.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { Modal } from '@/shared/ui/primitives/Modal';
import { useTenantConsoleStore } from '../model/useTenantConsoleStore';
import { ConsoleButton } from './consolePrimitives';

const ALL_SCOPES = ['read', 'write', 'admin'] as const;
const INPUT_STYLE = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--osio-border-default)', background: 'var(--osio-bg-surface)',
  color: 'var(--osio-fg-default)',
};

/** The one-time secret panel: copy-to-clipboard + a "won't be shown again" warning. */
function IssuedKeyView({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(secret).then(() => setCopied(true)).catch(() => setCopied(false));
  }
  return (
    <div style={{ padding: 20, display: 'grid', gap: 12 }}>
      <strong style={{ color: 'var(--osio-fg-warning, #b8860b)' }}>
        Copy this key now — it won&apos;t be shown again.
      </strong>
      <code style={{ ...INPUT_STYLE, wordBreak: 'break-all', userSelect: 'all' }}>{secret}</code>
      <div style={{ display: 'flex', gap: 8 }}>
        <ConsoleButton onClick={copy}><Copy size={14} aria-hidden /> {copied ? 'Copied' : 'Copy'}</ConsoleButton>
        <ConsoleButton onClick={onDone}>Done</ConsoleButton>
      </div>
    </div>
  );
}

/** The create-key form: name + scope checkboxes, submits via the store. */
function CreateKeyForm({ onCancel }: { onCancel: () => void }) {
  const error = useTenantConsoleStore((s) => s.error);
  const createKey = useTenantConsoleStore((s) => s.createKey);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read', 'write']);
  const [busy, setBusy] = useState(false);

  function toggle(scope: string) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    await createKey(name.trim(), scopes);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={{ padding: 20, display: 'grid', gap: 14 }}>
      <h3 style={{ margin: 0 }}>Create API key</h3>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Name</span>
        <input style={INPUT_STYLE} value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. production server" required />
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 16 }}>
        {ALL_SCOPES.map((scope) => (
          <label key={scope} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggle(scope)} />
            {scope}
          </label>
        ))}
      </fieldset>
      {error ? <p style={{ color: 'var(--osio-fg-danger, #d33)' }}>{error}</p> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <ConsoleButton onClick={onCancel}>Cancel</ConsoleButton>
        <ConsoleButton type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create'}
        </ConsoleButton>
      </div>
    </form>
  );
}

export function CreateKeyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lastIssuedKey = useTenantConsoleStore((s) => s.lastIssuedKey);
  const clearLastIssuedKey = useTenantConsoleStore((s) => s.clearLastIssuedKey);

  function close() {
    clearLastIssuedKey();
    onClose();
  }

  return (
    <Modal open={open} onClose={close} title="Create API key" size="sm">
      {lastIssuedKey
        ? <IssuedKeyView secret={lastIssuedKey.key} onDone={close} />
        : <CreateKeyForm onCancel={close} />}
    </Modal>
  );
}
