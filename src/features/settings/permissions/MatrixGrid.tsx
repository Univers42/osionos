/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MatrixGrid.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import type { EngineRole } from '@/features/share';
import { MatrixCell } from './MatrixCell';
import type { MatrixCellState } from './matrixModel';

interface MatrixGridProps {
  roles: EngineRole[];
  resources: string[];
  saving: boolean;
  cellFor: (roleId: string, resource: string) => MatrixCellState;
  onCycle: (roleId: string, resource: string) => void;
}

/** Roles × resources grid. agency:* roles sort first (the live simulation). */
export const MatrixGrid: React.FC<MatrixGridProps> = ({ roles, resources, saving, cellFor, onCycle }) => {
  const orderedRoles = [...roles].sort((a, b) => {
    const agencyDelta = Number(b.name.startsWith('agency:')) - Number(a.name.startsWith('agency:'));
    return agencyDelta !== 0 ? agencyDelta : a.name.localeCompare(b.name);
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--osio-db-line)]">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-[var(--osio-bg-subtle)] text-left text-xs font-medium text-[var(--osio-fg-muted)]">
          <tr>
            <th className="sticky left-0 border-b border-[var(--osio-db-line)] bg-[var(--osio-bg-subtle)] px-3 py-2">Role</th>
            {resources.map((resource) => (
              <th key={resource} className="border-b border-[var(--osio-db-line)] px-1 py-2 text-center font-mono text-[11px]">{resource}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--osio-db-line-soft)]">
          {orderedRoles.map((role) => (
            <tr key={role.id} className="hover:bg-[var(--osio-bg-hover)]/40">
              <td className="sticky left-0 max-w-[180px] bg-[var(--osio-bg-surface)] px-3 py-1">
                <div className="truncate font-medium text-[var(--osio-fg-default)]">{role.name}</div>
                {typeof role.metadata?.['department'] === 'string' && (
                  <div className="truncate text-[10px] text-[var(--osio-fg-subtle)]">
                    {String(role.metadata['department'])} · clearance {String(role.metadata['clearance'] ?? '—')}
                  </div>
                )}
              </td>
              {resources.map((resource) => (
                <td key={`${role.id}-${resource}`} className="px-0.5 py-0.5">
                  <MatrixCell
                    cell={cellFor(role.id, resource)}
                    roleName={role.name}
                    resource={resource}
                    disabled={saving}
                    onCycle={() => onCycle(role.id, resource)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
