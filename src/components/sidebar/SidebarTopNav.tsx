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
import { Search, Home, Mic, Sparkles, Inbox, BookOpen } from 'lucide-react';

import { SidebarNavItem } from './SidebarNavItem';

interface SidebarTopNavProps {
  isHomeActive: boolean;
  onOpenHome?: () => void;
}

/** Top-level navigation items: Search, Home, Meetings, AI, Inbox, Library. */
export const SidebarTopNav: React.FC<SidebarTopNavProps> = ({ isHomeActive, onOpenHome }) => (
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
  </div>
);
