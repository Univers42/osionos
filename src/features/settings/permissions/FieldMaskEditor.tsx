/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   FieldMaskEditor.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/shared/ui';
import type { EnginePolicyRow } from '@/features/share';

interface FieldMaskEditorProps {
  policy: EnginePolicyRow;
  saving: boolean;
  onSave: (conditions: Record<string, unknown>) => void;
}

function readMask(policy: EnginePolicyRow): { hide: string[]; redact: Record<string, string> } {
  const conditions = policy.conditions ?? {};
  const mask = (conditions['mask'] ?? conditions['field_mask'] ?? {}) as Record<string, unknown>;
  const hide = Array.isArray(mask['hide']) ? mask['hide'].map(String) : [];
  const redact = (mask['redact'] && typeof mask['redact'] === 'object' && !Array.isArray(mask['redact']))
    ? Object.fromEntries(Object.entries(mask['redact'] as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
    : {};
  return { hide, redact };
}

/** Per-resource field mask: hide[] removes fields entirely, redact{} replaces
 *  values. Persists under conditions.mask (the shape both evaluators read).
 *  Mount with `key={policy.id}` so drafts reset on policy change. */
export const FieldMaskEditor: React.FC<FieldMaskEditorProps> = ({ policy, saving, onSave }) => {
  const [hide, setHide] = useState<string[]>(() => readMask(policy).hide);
  const [redact, setRedact] = useState<Record<string, string>>(() => readMask(policy).redact);
  const [hideDraft, setHideDraft] = useState('');
  const [redactField, setRedactField] = useState('');
  const [redactValue, setRedactValue] = useState('***');

  function persist(nextHide: string[], nextRedact: Record<string, string>) {
    setHide(nextHide);
    setRedact(nextRedact);
    const conditions: Record<string, unknown> = { ...(policy.conditions ?? {}) };
    delete conditions['field_mask'];
    if (nextHide.length || Object.keys(nextRedact).length) {
      conditions['mask'] = { ...(nextHide.length ? { hide: nextHide } : {}), ...(Object.keys(nextRedact).length ? { redact: nextRedact } : {}) };
    } else {
      delete conditions['mask'];
    }
    onSave(conditions);
  }

  const chipClass = 'inline-flex items-center gap-1 rounded-md bg-[var(--osio-bg-subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--osio-fg-default)]';

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-[var(--osio-fg-muted)]">Hide:</span>
        {hide.map((field) => (
          <span key={field} className={chipClass}>
            {field}
            <button type="button" aria-label={`Stop hiding ${field}`} disabled={saving} onClick={() => persist(hide.filter((f) => f !== field), redact)}><X size={10} /></button>
          </span>
        ))}
        <Input className="w-28" value={hideDraft} placeholder="field name" onChange={(event) => setHideDraft(event.currentTarget.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && hideDraft.trim()) { persist([...hide, hideDraft.trim()], redact); setHideDraft(''); } }} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-[var(--osio-fg-muted)]">Redact:</span>
        {Object.entries(redact).map(([field, replacement]) => (
          <span key={field} className={chipClass}>
            {field}→{replacement}
            <button type="button" aria-label={`Stop redacting ${field}`} disabled={saving} onClick={() => { const next = { ...redact }; delete next[field]; persist(hide, next); }}><X size={10} /></button>
          </span>
        ))}
        <Input className="w-24" value={redactField} placeholder="field" onChange={(event) => setRedactField(event.currentTarget.value)} />
        <Input className="w-16" value={redactValue} placeholder="***" onChange={(event) => setRedactValue(event.currentTarget.value)} />
        <button
          type="button"
          disabled={saving || !redactField.trim()}
          className="rounded-md border border-[var(--osio-border-default)] px-2 py-1.5 text-xs transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => { persist(hide, { ...redact, [redactField.trim()]: redactValue || '***' }); setRedactField(''); }}
        >
          Add
        </button>
      </div>
    </div>
  );
};
