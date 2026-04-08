/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarFooter.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { Settings, LayoutGrid, Trash2, UserPlus, X } from 'lucide-react';

import { SidebarNavItem } from './SidebarNavItem';

interface SidebarFooterProps {
  onOpenSettings?: () => void;
  showInviteCTA:   boolean;
  onDismissInvite: () => void;
}

/** Bottom section: Settings / Marketplace / Trash + optional Invite CTA. */
export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  onOpenSettings,
  showInviteCTA,
  onDismissInvite,
}) => (
  <>
    <div className="h-px w-full shrink-0 -mt-px z-[99]" style={{ boxShadow: '0 1px 0 var(--color-line)', transition: 'box-shadow 300ms' }} />

    <div className="px-2 pt-1 flex flex-col gap-px">
      <SidebarNavItem
        icon={<Settings size={16} />}
        label="Settings"
        onClick={() => onOpenSettings?.()}
      />
      <SidebarNavItem
        icon={<LayoutGrid size={16} />}
        label="Marketplace"
        onClick={() => {/* placeholder */}}
      />
      <SidebarNavItem
        icon={<Trash2 size={16} />}
        label="Trash"
        onClick={() => {/* placeholder */}}
      />
    </div>

    {showInviteCTA && (
      <div className="mx-2 mb-2 mt-1.5 relative">
        <div
          className="relative p-2 rounded-lg overflow-hidden cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors duration-100"
          style={{ boxShadow: 'var(--color-line) 0 0 0 1px' }}
        >
          <div className="flex items-start gap-2">
            <UserPlus size={20} className="shrink-0 text-[var(--color-ink)] mt-0.5" />
            <div className="flex-1 min-w-0 pt-1">
              <p className="text-[12px] font-semibold text-[var(--color-ink)] leading-4">Invite members</p>
              <p className="text-[12px] text-[var(--color-ink-muted)] leading-4">Collaborate with your team.</p>
            </div>
          </div>
          {/* Dismiss button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDismissInvite(); }}
            className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    )}
  </>
);
