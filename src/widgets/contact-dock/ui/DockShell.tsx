/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DockShell.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Fixed anchor for the contact dock, in the bottom corner the primary side bar
 * does not use: bottom-right, or bottom-left (mirrored, launcher outermost)
 * while the side bar docks right, so the bar never covers it. Token-driven layering: sits
 * at --osio-z-sticky and is raised to --osio-z-popover when a chat tab holds
 * focus, so an active conversation floats above sticky page chrome.
 */

import React from 'react';

import { useEffectiveSidebarSide } from '@/shared/config/useSidebarSide';

interface DockShellProps {
  raised?: boolean;
  children: React.ReactNode;
}

export const DockShell: React.FC<DockShellProps> = ({ raised = false, children }) => {
  const corner = useEffectiveSidebarSide() === 'right' ? 'left-0 flex-row-reverse' : 'right-0';
  return (
    <div
      data-osio-dock
      className={`pointer-events-none fixed bottom-[var(--osio-dock-inset,0px)] ${corner} flex max-w-full items-end gap-[var(--osio-space-3)] p-[var(--osio-space-4)]`}
      style={{ zIndex: raised ? 'var(--osio-z-popover)' : 'var(--osio-z-sticky)' }}
    >
      {children}
    </div>
  );
};
