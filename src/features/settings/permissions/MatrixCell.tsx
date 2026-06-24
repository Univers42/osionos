/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MatrixCell.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { LEVEL_GLYPHS, type MatrixCellState } from './matrixModel';

const LEVEL_CLASSES: Record<string, string> = {
  none: 'text-[var(--osio-fg-subtle)]',
  view: 'text-[var(--osio-fg-muted)]',
  edit: 'text-[var(--osio-accent)]',
  full: 'text-[var(--osio-success)] font-semibold',
  deny: 'text-[var(--osio-danger)] font-semibold',
};

interface MatrixCellProps {
  cell: MatrixCellState;
  roleName: string;
  resource: string;
  disabled?: boolean;
  onCycle: () => void;
}

/** chmod-style cell: click cycles none→view(r)→edit(rw)→full(rwd)→none.
 *  Badges: M = field mask present, C = extra JSONB conditions present. */
export const MatrixCell: React.FC<MatrixCellProps> = ({ cell, roleName, resource, disabled = false, onCycle }) => (
  <button
    type="button"
    disabled={disabled}
    title={`${roleName} × ${resource}: ${cell.level}${cell.masked ? ' (masked)' : ''} — click to cycle`}
    aria-label={`${roleName} on ${resource}: ${cell.level}. Click to cycle access.`}
    onClick={onCycle}
    className={`relative flex h-8 w-full min-w-[52px] items-center justify-center rounded-md border border-transparent font-mono text-xs transition-colors duration-[120ms] hover:border-[var(--osio-db-line)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${LEVEL_CLASSES[cell.level]}`}
  >
    {LEVEL_GLYPHS[cell.level]}
    {(cell.masked || cell.conditioned) && (
      <span className="absolute right-0.5 top-0.5 flex gap-0.5">
        {cell.masked && <span className="rounded bg-[var(--osio-accent-subtle)] px-0.5 text-[8px] leading-3 text-[var(--osio-accent-text)]">M</span>}
        {cell.conditioned && <span className="rounded bg-[var(--osio-bg-subtle)] px-0.5 text-[8px] leading-3 text-[var(--osio-fg-muted)]">C</span>}
      </span>
    )}
  </button>
);
