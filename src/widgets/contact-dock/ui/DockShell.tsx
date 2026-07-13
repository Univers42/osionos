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
 * Fixed bottom-right anchor for the contact dock. Token-driven layering: sits
 * at --osio-z-sticky and is raised to --osio-z-popover when a chat tab holds
 * focus, so an active conversation floats above sticky page chrome.
 */

import React from 'react';

interface DockShellProps {
  raised?: boolean;
  children: React.ReactNode;
}

export const DockShell: React.FC<DockShellProps> = ({ raised = false, children }) => (
  <div
    data-osio-dock
    className="pointer-events-none fixed bottom-0 right-0 flex max-w-full items-end gap-[var(--osio-space-3)] p-[var(--osio-space-4)]"
    style={{ zIndex: raised ? 'var(--osio-z-popover)' : 'var(--osio-z-sticky)' }}
  >
    {children}
  </div>
);
