/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ApiKeysSection.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { Badge } from '@/shared/ui';
import type { ApiKey } from '../model/tenantConsoleTypes';
import { useTenantConsoleStore } from '../model/useTenantConsoleStore';
import { ConsoleSection, ConsoleRow, ConsoleButton, ConsoleEmpty } from './consolePrimitives';
import { CreateKeyModal } from './CreateKeyModal';

const CELL = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' as const };
const MUTED = { color: 'var(--osio-fg-muted)' };

function fmtDate(value?: string | null) {
  if (!value) return 'never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

/** One key row: identity + metadata + revoke (or a "revoked" marker). */
function KeyRowItem({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: (id: string) => void }) {
  const revoked = Boolean(apiKey.revoked_at);
  return (
    <ConsoleRow>
      <span style={{ ...CELL, fontWeight: 600 }}>{apiKey.name}</span>
      <code style={{ ...CELL, ...MUTED }}>{apiKey.key_prefix}…</code>
      <span style={{ ...CELL, ...MUTED }}>{apiKey.scopes.join(', ') || '—'}</span>
      <span style={{ ...CELL, ...MUTED }}>{fmtDate(apiKey.created_at)}</span>
      <span style={{ ...CELL, ...MUTED }}>{fmtDate(apiKey.last_used_at)}</span>
      {revoked ? (
        <Badge tone="danger">revoked</Badge>
      ) : (
        <ConsoleButton tone="danger" onClick={() => onRevoke(apiKey.id)}>
          <Trash2 size={14} aria-hidden /> Revoke
        </ConsoleButton>
      )}
    </ConsoleRow>
  );
}

/** API Keys section: list + create-key modal trigger. */
export function ApiKeysSection() {
  const keys = useTenantConsoleStore((s) => s.keys);
  const loading = useTenantConsoleStore((s) => s.loading);
  const error = useTenantConsoleStore((s) => s.error);
  const revokeKey = useTenantConsoleStore((s) => s.revokeKey);
  const [open, setOpen] = useState(false);

  return (
    <ConsoleSection
      title="API Keys"
      icon={<KeyRound size={16} aria-hidden />}
      action={<ConsoleButton onClick={() => setOpen(true)}>Create key</ConsoleButton>}
    >
      {error ? <p style={{ color: 'var(--osio-danger)' }}>{error}</p> : null}
      {keys.length === 0 ? (
        <ConsoleEmpty>{loading ? 'Loading keys…' : 'No API keys yet. Create one to get started.'}</ConsoleEmpty>
      ) : (
        keys.map((apiKey) => <KeyRowItem key={apiKey.id} apiKey={apiKey} onRevoke={revokeKey} />)
      )}
      <CreateKeyModal open={open} onClose={() => setOpen(false)} />
    </ConsoleSection>
  );
}
