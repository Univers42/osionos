/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConditionEditor.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import type { EnginePolicyRow } from '@/features/share';

interface ConditionEditorProps {
  policy: EnginePolicyRow;
  saving: boolean;
  onSave: (conditions: Record<string, unknown>) => void;
}

/** Edit the well-known attribute keys of a policy's JSONB conditions
 *  (clearance / department / time_window). Mask keys are preserved as-is
 *  (FieldMaskEditor owns them). Mount with `key={policy.id}` so drafts
 *  reset when another policy is inspected. */
export const ConditionEditor: React.FC<ConditionEditorProps> = ({ policy, saving, onSave }) => {
  const conditions = policy.conditions ?? {};
  const [clearance, setClearance] = useState(() => (conditions['clearance'] == null ? '' : String(conditions['clearance'])));
  const [department, setDepartment] = useState(() => (conditions['department'] == null ? '' : String(conditions['department'])));
  const [timeWindow, setTimeWindow] = useState(() => (conditions['time_window'] == null ? '' : String(conditions['time_window'])));

  function buildConditions(): Record<string, unknown> {
    const next: Record<string, unknown> = { ...conditions };
    delete next['clearance'];
    delete next['department'];
    delete next['time_window'];
    if (clearance.trim()) next['clearance'] = Number.isNaN(Number(clearance)) ? clearance.trim() : Number(clearance);
    if (department.trim()) next['department'] = department.trim();
    if (timeWindow.trim()) next['time_window'] = timeWindow.trim();
    return next;
  }

  const inputClass = 'w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1.5 text-sm text-[var(--osio-fg-default)] outline-none focus:border-[var(--osio-accent)]';

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-[var(--osio-fg-muted)]">
          Clearance (min)
          <input className={`mt-1 ${inputClass}`} value={clearance} placeholder="e.g. 3" onChange={(event) => setClearance(event.target.value)} />
        </label>
        <label className="text-xs text-[var(--osio-fg-muted)]">
          Department
          <input className={`mt-1 ${inputClass}`} value={department} placeholder="e.g. operations" onChange={(event) => setDepartment(event.target.value)} />
        </label>
        <label className="text-xs text-[var(--osio-fg-muted)]">
          Time window
          <input className={`mt-1 ${inputClass}`} value={timeWindow} placeholder="e.g. 08:00-20:00" onChange={(event) => setTimeWindow(event.target.value)} />
        </label>
      </div>
      <div className="flex items-center justify-between">
        <code className="truncate text-[10px] text-[var(--osio-fg-subtle)]">{JSON.stringify(policy.conditions ?? {})}</code>
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(buildConditions())}
          className="shrink-0 rounded-md bg-[var(--osio-accent)] px-3 py-1.5 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90 disabled:opacity-50"
        >
          Save conditions
        </button>
      </div>
    </div>
  );
};
