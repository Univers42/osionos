/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PermissionsPanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Dropdown } from '@/shared/ui';
import { usePolicyMatrix } from './usePolicyMatrix';
import { MatrixGrid } from './MatrixGrid';
import { ConditionEditor } from './ConditionEditor';
import { FieldMaskEditor } from './FieldMaskEditor';
import { ViewAsTester } from './ViewAsTester';

const SectionTitle: React.FC<{ title: string; anchor: string; children?: React.ReactNode }> = ({ title, anchor, children }) => (
  <div className="flex items-center justify-between border-b border-[var(--osio-border-default)] pb-3" data-settings-anchor={anchor}>
    <h3 className="text-base font-medium text-[var(--osio-fg-default)]">{title}</h3>
    {children}
  </div>
);

/** Settings → Permissions: Linux-chmod-style role × resource matrix over the
 *  live permission-engine, with condition/mask editors and a "View as" tester. */
export const PermissionsPanel: React.FC = () => {
  const matrix = usePolicyMatrix();
  const [inspectRoleId, setInspectRoleId] = useState('');
  const [inspectResource, setInspectResource] = useState('');

  const inspected = inspectRoleId && inspectResource ? matrix.cellFor(inspectRoleId, inspectResource) : null;

  return (
    <div className="space-y-9">
      <section className="space-y-4">
        <SectionTitle title="Access matrix" anchor="access-matrix">
          <button
            type="button"
            onClick={() => { void matrix.refresh(); }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--osio-border-default)] px-2.5 py-1 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </SectionTitle>
        <p className="text-sm text-[var(--osio-fg-muted)]">
          Click a cell to cycle <code className="font-mono text-xs">— → r → rw → rwd → —</code> (view / edit / full).
          <span className="ml-1">Badges: <strong>M</strong> field mask, <strong>C</strong> attribute conditions, <span className="text-[var(--osio-danger)]">✕</span> explicit deny.</span>
        </p>
        {matrix.error && <p className="rounded-md bg-[var(--osio-danger)]/10 px-3 py-2 text-sm text-[var(--osio-danger)]">{matrix.error}</p>}
        {matrix.loading
          ? <p className="text-sm text-[var(--osio-fg-muted)]">Loading roles and policies…</p>
          : (
            <MatrixGrid
              roles={matrix.roles}
              resources={matrix.resources}
              saving={matrix.saving}
              cellFor={matrix.cellFor}
              onCycle={(roleId, resource) => { void matrix.cycleCell(roleId, resource); }}
            />
          )}
      </section>

      <section className="space-y-4">
        <SectionTitle title="Conditions & field masks" anchor="policy-conditions" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--osio-fg-muted)]">Inspect policy:</span>
          <Dropdown
            value={inspectRoleId || 'Role'}
            options={matrix.roles.map((role) => ({ value: role.id, label: role.name }))}
            onChange={setInspectRoleId}
            align="start"
            width="auto"
          />
          <Dropdown
            value={inspectResource || 'Resource'}
            options={matrix.resources.map((name) => ({ value: name, label: name }))}
            onChange={setInspectResource}
            align="start"
            width="auto"
          />
        </div>
        {inspected?.policy ? (
          <div className="space-y-4 rounded-lg border border-[var(--osio-border-default)] p-3">
            <ConditionEditor
              key={`cond-${inspected.policy.id}`}
              policy={inspected.policy}
              saving={matrix.saving}
              onSave={(conditions) => { void matrix.saveCellConditions(inspectRoleId, inspectResource, conditions); }}
            />
            <FieldMaskEditor
              key={`mask-${inspected.policy.id}`}
              policy={inspected.policy}
              saving={matrix.saving}
              onSave={(conditions) => { void matrix.saveCellConditions(inspectRoleId, inspectResource, conditions); }}
            />
          </div>
        ) : (
          <p className="text-sm text-[var(--osio-fg-muted)]">
            {inspectRoleId && inspectResource
              ? 'No policy on this cell yet — click it in the matrix to grant a level first.'
              : 'Pick a role and a resource to edit the policy’s JSONB conditions and field masks.'}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle title="View as" anchor="view-as" />
        <p className="text-sm text-[var(--osio-fg-muted)]">Simulate a person from the roster against the live decision endpoint.</p>
        <ViewAsTester people={matrix.people} resources={matrix.resources} />
      </section>
    </div>
  );
};
