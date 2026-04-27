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

import React from "react";
import { Plus, Mail, CalendarRange, Monitor } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";

import type { ActivePage, PageEntry } from "@/entities/page";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarSection } from "./SidebarSection";
import { PageTreeItem } from "./PageTreeItem";
import { PageOptionsMenu } from "@/features/page-management";
import { usePageStore } from "@/store/usePageStore";
import {
  canReadPage,
  getCurrentPageAccessContext,
} from "@/shared/lib/auth/pageAccess";

interface WorkspaceRef {
  _id: string;
}

interface RecentPageActionsProps {
  recent: ActivePage;
  active: boolean;
  onRedirectHome: () => void;
  onAddChild: (e: React.MouseEvent, recent: ActivePage) => void;
}

const RecentPageActions: React.FC<RecentPageActionsProps> = ({
  recent,
  active,
  onRedirectHome,
  onAddChild,
}) => {
  const page = usePageStore((s) => s.pageById(recent.id));
  const accessContext = getCurrentPageAccessContext();

  if (!page || !canReadPage(page, accessContext)) {
    return null;
  }

  return (
    <div className="flex items-center gap-0.5 mr-0.5 shrink-0">
      <PageOptionsMenu
        pageId={recent.id}
        workspaceId={recent.workspaceId}
        pageTitle={recent.title || "Untitled"}
        isActivePage={active}
        onRedirectHome={onRedirectHome}
      />
      <button
        type="button"
        className="p-1 rounded hover:bg-[var(--color-surface-secondary)]"
        onClick={(e) => onAddChild(e, recent)}
        title="Add child page"
      >
        <Plus size={13} />
      </button>
    </div>
  );
};

interface RecentSidebarItemProps {
  recent: ActivePage;
  activePageId: string | null | undefined;
  onOpenPage: (page: ActivePage) => void;
  onRedirectHome: () => void;
  onAddChild: (e: React.MouseEvent, recent: ActivePage) => void;
}

const RecentSidebarItem: React.FC<RecentSidebarItemProps> = ({
  recent,
  activePageId,
  onOpenPage,
  onRedirectHome,
  onAddChild,
}) => {
  const page = usePageStore((s) => s.pageById(recent.id));
  const accessContext = getCurrentPageAccessContext();

  if (!page || !canReadPage(page, accessContext)) {
    return null;
  }

  const isActive = activePageId === recent.id;

  return (
    <SidebarNavItem
      icon={
        recent.icon ? (
          <AssetRenderer value={recent.icon} size={14} />
        ) : (
          <AssetRenderer value="icon:page" size={14} />
        )
      }
      label={recent.title ?? "Untitled"}
      active={isActive}
      onClick={() => onOpenPage(recent)}
      rightElement={
        <RecentPageActions
          recent={recent}
          active={isActive}
          onRedirectHome={onRedirectHome}
          onAddChild={onAddChild}
        />
      }
    />
  );
};

interface SidebarPageTreeProps {
  recents: ActivePage[];
  activePage: ActivePage | null;
  openPage: (page: ActivePage) => void;
  privateWorkspaces: WorkspaceRef[];
  sharedWorkspaces: WorkspaceRef[];
  pagesByWorkspace: Record<string, PageEntry[]>;
  jwt: string;
  onAddToWorkspace: (wsId: string) => void;
}

/** Scrollable page-tree area: Recents, Agents, Private, Shared, Notion apps. */
export const SidebarPageTree: React.FC<SidebarPageTreeProps> = ({
  recents,
  activePage,
  openPage,
  privateWorkspaces,
  sharedWorkspaces,
  pagesByWorkspace,
  jwt,
  onAddToWorkspace,
}) => {
  const addPage = usePageStore((s) => s.addPage);
  const pageById = usePageStore((s) => s.pageById);
  const accessContext = getCurrentPageAccessContext();

  const handleAddChildToRecent = async (
    e: React.MouseEvent,
    recent: ActivePage,
  ) => {
    e.stopPropagation();
    const child = await addPage(recent.workspaceId, "Untitled", jwt, recent.id);
    if (child) {
      openPage({
        id: child._id,
        workspaceId: recent.workspaceId,
        kind: "page",
        title: child.title,
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SidebarSection label="Recents">
        {recents.length > 0 ? (
          recents
            .filter((r) => {
              const page = pageById(r.id);
              return !!page && canReadPage(page, accessContext);
            })
            .slice(0, 8)
            .map((r) => (
              <RecentSidebarItem
                key={r.id}
                recent={r}
                activePageId={activePage?.id}
                onOpenPage={openPage}
                onRedirectHome={() =>
                  usePageStore.setState({
                    activePage: null,
                    navigationPath: [],
                  })
                }
                onAddChild={handleAddChildToRecent}
              />
            ))
        ) : (
          <p className="px-2 py-1 text-xs text-[var(--color-ink-faint)] italic">
            Pages you visit will appear here
          </p>
        )}
      </SidebarSection>

      <SidebarSection label="Agents">
        <SidebarNavItem
          icon={<Plus size={14} />}
          label="New agent"
          subtle
          onClick={() => {
            /* placeholder */
          }}
        />
      </SidebarSection>

      {privateWorkspaces.map((ws) => {
        const pages = (pagesByWorkspace[ws._id] ?? []).filter(
          (p) => !p.parentPageId && !p.archivedAt,
        );
        return (
          <SidebarSection
            key={ws._id}
            label="Private"
            defaultOpen
            onAdd={() => onAddToWorkspace(ws._id)}
            onMore={() => {
              /* placeholder */
            }}
          >
            {pages.length === 0 && (
              <p className="px-2 py-1 text-xs text-[var(--color-ink-faint)] italic">
                No pages yet
              </p>
            )}
            {pages.map((page) => (
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
        {sharedWorkspaces.length > 0 ? (
          sharedWorkspaces.map((ws) => {
            const pages = (pagesByWorkspace[ws._id] ?? []).filter(
              (p) => !p.parentPageId && !p.archivedAt,
            );
            return pages.map((page) => (
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
        ) : (
          <SidebarNavItem
            icon={<Plus size={14} className="text-[var(--color-accent)]" />}
            label="Start collaborating"
            subtle
            onClick={() => {
              /* placeholder */
            }}
          />
        )}
      </SidebarSection>

      <SidebarSection label="Notion apps">
        <SidebarNavItem
          icon={<Mail size={16} />}
          label="Notion Mail"
          onClick={() => {
            /* placeholder */
          }}
        />
        <SidebarNavItem
          icon={<CalendarRange size={16} />}
          label="Notion Calendar"
          onClick={() => {
            /* placeholder */
          }}
        />
        <SidebarNavItem
          icon={<Monitor size={16} />}
          label="Notion Desktop"
          onClick={() => {
            /* placeholder */
          }}
        />
      </SidebarSection>
    </div>
  );
};
