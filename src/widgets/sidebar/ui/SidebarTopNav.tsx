/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarTopNav.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { Search, Home, Mic, Sparkles, Inbox, BookOpen, Sun, Moon, Monitor } from 'lucide-react';

import { SidebarNavItem } from './SidebarNavItem';
import {
  applyTheme,
  persistThemeMode,
  readStoredThemeMode,
  type ThemeMode,
} from '@/shared/config/theme';

interface SidebarTopNavProps {
  isHomeActive: boolean;
  onOpenHome?: () => void;
}

/** Top-level navigation items: Search, Home, Meetings, AI, Inbox, Library. */
function nextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === 'light') return 'dark';
  if (mode === 'dark') return 'system';
  return 'light';
}

function themeLabel(mode: ThemeMode): string {
  if (mode === 'light') return 'Theme: Light';
  if (mode === 'dark') return 'Theme: Dark';
  return 'Theme: System';
}

function themeIcon(mode: ThemeMode): React.ReactNode {
  if (mode === 'light') return <Sun size={16} />;
  if (mode === 'dark') return <Moon size={16} />;
  return <Monitor size={16} />;
}

export const SidebarTopNav: React.FC<SidebarTopNavProps> = ({ isHomeActive, onOpenHome }) => {
  const [themeMode, setThemeMode] = React.useState<ThemeMode>(() => readStoredThemeMode());

  React.useEffect(() => {
    applyTheme(themeMode);
    persistThemeMode(themeMode);
  }, [themeMode]);

  return (
  <div className="flex flex-col gap-px pb-2 mx-2 cursor-pointer">
    <SidebarNavItem
      icon={<Search size={16} />}
      label="Search"
      onClick={() => { /* noop — search modal not yet implemented */ }}
    />
    <SidebarNavItem
      icon={<Home size={16} />}
      label="Home"
      active={isHomeActive}
      onClick={() => onOpenHome?.()}
    />
    <SidebarNavItem
      icon={<Mic size={16} />}
      label="Meetings"
      onClick={() => {/* placeholder */}}
    />
    <SidebarNavItem
      icon={<Sparkles size={16} />}
      label="Notion AI"
      onClick={() => {/* placeholder */}}
    />
    <SidebarNavItem
      icon={<Inbox size={16} />}
      label="Inbox"
      onClick={() => {/* placeholder */}}
    />
    <SidebarNavItem
      icon={<BookOpen size={16} />}
      label="Library"
      onClick={() => {/* placeholder */}}
    />
    <SidebarNavItem
      icon={themeIcon(themeMode)}
      label={themeLabel(themeMode)}
      onClick={() => setThemeMode((mode) => nextThemeMode(mode))}
    />
  </div>
  );
};
