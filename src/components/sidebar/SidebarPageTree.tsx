/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarPageTree.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { Plus, File, Mail, CalendarRange, Monitor } from 'lucide-react';

import type { ActivePage, PageEntry } from '../../store/pageStore.types';
import { SidebarNavItem }  from './SidebarNavItem';
import { SidebarSection }  from './SidebarSection';
import { PageTreeItem }    from './PageTreeItem';

interface WorkspaceRef {
  _id: string;
}

interface SidebarPageTreeProps {
  recents:            ActivePage[];
  activePage:         ActivePage | null;
  openPage:           (page: ActivePage) => void;
  privateWorkspaces:  WorkspaceRef[];
  sharedWorkspaces:   WorkspaceRef[];
  pagesForWs:         (wsId: string) => PageEntry[];
  jwt:                string;
  onAddToWorkspace:   (wsId: string) => void;
}

/** Scrollable page-tree area: Recents, Agents, Private, Shared, Notion apps. */
export const SidebarPageTree: React.FC<SidebarPageTreeProps> = ({
  recents,
  activePage,
  openPage,
  privateWorkspaces,
  sharedWorkspaces,
  pagesForWs,
  jwt,
  onAddToWorkspace,
}) => (
  <div className="flex flex-col gap-3">

    <SidebarSection label="Recents">
      {recents.length > 0
        ? recents.slice(0, 8).map(r => (
            <SidebarNavItem
              key={r.id}
              icon={r.icon
                ? <span className="text-sm leading-none">{r.icon}</span>
                : <File size={14} className="text-[var(--color-ink-faint)]" />
              }
              label={r.title ?? 'Untitled'}
              active={activePage?.id === r.id}
              onClick={() => openPage(r)}
            />
          ))
        : (
          <p className="px-2 py-1 text-xs text-[var(--color-ink-faint)] italic">
            Pages you visit will appear here
          </p>
        )
      }
    </SidebarSection>


    <SidebarSection label="Agents">
      <SidebarNavItem
        icon={<Plus size={14} />}
        label="New agent"
        subtle
        onClick={() => {/* placeholder */}}
      />
    </SidebarSection>


    {privateWorkspaces.map(ws => {
      const pages = pagesForWs(ws._id).filter(p => !p.parentPageId && !p.archivedAt);
      return (
        <SidebarSection
          key={ws._id}
          label="Private"
          defaultOpen
          onAdd={() => onAddToWorkspace(ws._id)}
          onMore={() => {/* placeholder */}}
        >
          {pages.length === 0 && (
            <p className="px-2 py-1 text-xs text-[var(--color-ink-faint)] italic">
              No pages yet
            </p>
          )}
          {pages.map(page => (
            <PageTreeItem
              key={page._id}
              page={page}
              workspaceId={ws._id}
              jwt={jwt}
              depth={0}
              activeId={activePage?.id}
            />
          ))}
        </SidebarSection>
      );
    })}


    <SidebarSection label="Shared">
      {sharedWorkspaces.length > 0
        ? sharedWorkspaces.map(ws => {
            const pages = pagesForWs(ws._id).filter(p => !p.parentPageId && !p.archivedAt);
            return pages.map(page => (
              <PageTreeItem
                key={page._id}
                page={page}
                workspaceId={ws._id}
                jwt={jwt}
                depth={0}
                activeId={activePage?.id}
              />
            ));
          })
        : (
          <SidebarNavItem
            icon={<Plus size={14} className="text-[var(--color-accent)]" />}
            label="Start collaborating"
            subtle
            onClick={() => {/* placeholder */}}
          />
        )
      }
    </SidebarSection>


    <SidebarSection label="Notion apps">
      <SidebarNavItem
        icon={<Mail size={16} />}
        label="Notion Mail"
        onClick={() => {/* placeholder */}}
      />
      <SidebarNavItem
        icon={<CalendarRange size={16} />}
        label="Notion Calendar"
        onClick={() => {/* placeholder */}}
      />
      <SidebarNavItem
        icon={<Monitor size={16} />}
        label="Notion Desktop"
        onClick={() => {/* placeholder */}}
      />
    </SidebarSection>

  </div>
);
