/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarNavItem.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/04 22:31:03 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';

interface Props {
  icon:     React.ReactNode;
  label:    string;
  count?:   number;
  active?:  boolean;
  indent?:  number;                  // 0 = top-level
  subtle?:  boolean;                 // muted text for section-level items
  onClick:  () => void;
}

/**
 * A single 30 px-tall row in the Notion-style left sidebar.
 * Matches Notion's exact dimensions: 30px height, 6px border-radius,
 * 14px font-size, 8px horizontal padding, 22×22 icon slot.
 */
export const SidebarNavItem: React.FC<Props> = ({
  icon, label, count, active = false, indent = 0, subtle = false, onClick,
}) => {
  const paddingLeft = 8 + indent * 12;

  let stateClass: string;
  if (active) stateClass = 'bg-[var(--color-surface-tertiary)] text-[var(--color-ink)]';
  else if (subtle) stateClass = 'text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink-muted)]';
  else stateClass = 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-ink)]';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full flex items-center gap-2 rounded-[6px] text-[14px] select-none',
        'transition-colors duration-100 cursor-pointer',
        'font-medium',
        stateClass,
      ].join(' ')}
      style={{ paddingLeft, paddingRight: 8, height: 30, minHeight: 27 }}
    >
      {/* Icon slot: fixed 22 × 22 matching Notion */}
      <span className="flex items-center justify-center w-[22px] h-[22px] shrink-0 opacity-70">
        {icon}
      </span>

      <span className="flex-1 text-left truncate">{label}</span>

      {count !== undefined && count > 0 && (
        <span className="text-[10px] font-semibold min-w-[16px] h-4 flex items-center justify-center rounded px-[3px] bg-red-500 text-white">
          {count}
        </span>
      )}
    </button>
  );
};
