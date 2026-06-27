/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DockTabStrip.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The row of stacked LinkedIn-style chat tabs, left of the dock panel. The AI
 * panel (when open) stacks first; then each open conversation. State is read
 * from useDockStore so the strip stays in sync with the panel's open actions.
 */

import React from 'react';

import { useDockStore } from '../model/useDockStore';
import { AiDockPanel } from './AiDockPanel';
import { DockChatTab } from './DockChatTab';

export const DockTabStrip: React.FC = () => {
  const openTabs = useDockStore((s) => s.openTabs);
  const minimized = useDockStore((s) => s.minimized);
  const focusedId = useDockStore((s) => s.focusedId);
  const aiOpen = useDockStore((s) => s.aiOpen);
  const focusTab = useDockStore((s) => s.focusTab);
  const minimizeTab = useDockStore((s) => s.minimizeTab);
  const closeTab = useDockStore((s) => s.closeTab);
  const toggleAi = useDockStore((s) => s.toggleAi);

  if (!aiOpen && openTabs.length === 0) return null;

  return (
    <div className="flex items-end gap-[var(--osio-space-3)]">
      {aiOpen && <AiDockPanel onClose={toggleAi} />}
      {openTabs.map((tab) => (
        <DockChatTab
          key={tab.channelId}
          tab={tab}
          focused={focusedId === tab.channelId}
          minimized={minimized.has(tab.channelId)}
          onFocus={() => focusTab(tab.channelId)}
          onMinimize={() => minimizeTab(tab.channelId)}
          onClose={() => closeTab(tab.channelId)}
        />
      ))}
    </div>
  );
};
