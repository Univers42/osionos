/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarPageTree.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/05 15:08:41 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";
import { Plus, Mail, CalendarRange, Monitor, Hash, Lock, MessageSquare, Volume2, Video, GitBranch, Archive, Bot } from "lucide-react";
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
import { useUserStore } from "@/features/auth";
import {
  resolveWorkspaceConfig,
  useWorkspaceConfigStore,
  workspaceConfigKey,
} from "@/shared/config/workspaceConfigStore";

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

function runWorkspaceAction(action: Promise<unknown>) {
  action.catch((error: unknown) => {
    console.error("[SidebarPageTree] Workspace action failed", error);
  });
}

/** Scrollable page-tree area: Recents, Agents, Private, Shared, osionos apps. */
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
  const activeUserId = useUserStore((s) => s.activeUserId);
  const activeWorkspace = useUserStore((s) => s.activeWorkspace());
  const activeWorkspaceId = activeWorkspace?._id ?? privateWorkspaces[0]?._id ?? sharedWorkspaces[0]?._id ?? "";
  const workspaceKey = workspaceConfigKey(activeUserId || "anonymous", activeWorkspaceId || "workspace");
  const storedWorkspaceConfig = useWorkspaceConfigStore((s) => s.configs[workspaceKey]);
  const workspaceConfig = useMemo(() => resolveWorkspaceConfig(storedWorkspaceConfig), [storedWorkspaceConfig]);
  const addChannel = useWorkspaceConfigStore((s) => s.addChannel);
  const addThread = useWorkspaceConfigStore((s) => s.addThread);
  const updateChannel = useWorkspaceConfigStore((s) => s.updateChannel);
  const accessContext = getCurrentPageAccessContext();

  const rootChannels = workspaceConfig.channels.filter((channel) => !channel.parentChannelId);
  const visibleRootChannels = rootChannels.filter((channel) => channel.visibility === "workspace" || channel.memberIds.includes(activeUserId));

  function channelIcon(type: string, restricted: boolean) {
    if (restricted) return <Lock size={14} />;
    if (type === "thread") return <GitBranch size={14} />;
    if (type === "forum") return <MessageSquare size={14} />;
    if (type === "audio" || type === "stage") return <Volume2 size={14} />;
    if (type === "video") return <Video size={14} />;
    if (type === "archive") return <Archive size={14} />;
    if (type === "agent") return <Bot size={14} />;
    return <Hash size={14} />;
  }

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

      <SidebarSection
        label="Channels"
        defaultOpen
        onAdd={() => {
          if (activeWorkspaceId) runWorkspaceAction(addChannel(activeUserId || "anonymous", activeWorkspaceId, "general", "text"));
        }}
      >
        <div className="mb-1 grid grid-cols-2 gap-1 px-1 text-[11px]">
          <button type="button" className="rounded px-2 py-1 text-left text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]" onClick={() => activeWorkspaceId && runWorkspaceAction(addChannel(activeUserId || "anonymous", activeWorkspaceId, "messages", "text"))}>+ messages</button>
          <button type="button" className="rounded px-2 py-1 text-left text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]" onClick={() => activeWorkspaceId && runWorkspaceAction(addChannel(activeUserId || "anonymous", activeWorkspaceId, "forum", "forum"))}>+ forum</button>
          <button type="button" className="rounded px-2 py-1 text-left text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]" onClick={() => activeWorkspaceId && runWorkspaceAction(addChannel(activeUserId || "anonymous", activeWorkspaceId, "audio", "audio"))}>+ audio</button>
          <button type="button" className="rounded px-2 py-1 text-left text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)]" onClick={() => activeWorkspaceId && runWorkspaceAction(addChannel(activeUserId || "anonymous", activeWorkspaceId, "video", "video"))}>+ video</button>
        </div>
        {visibleRootChannels.length === 0 ? (
          <p className="px-2 py-1 text-xs text-[var(--color-ink-faint)] italic">
            Add messages, threads, audio or video channels.
          </p>
        ) : (
          visibleRootChannels
            .map((channel) => (
              <React.Fragment key={channel.id}>
                <SidebarNavItem
                  icon={channelIcon(channel.type, channel.visibility === "members")}
                  label={channel.name}
                  active={activePage?.kind === "channel" && activePage.id === channel.id}
                  onClick={() => openPage({
                    id: channel.id,
                    workspaceId: activeWorkspaceId,
                    kind: "channel",
                    title: channel.name,
                  })}
                  rightElement={
                    <div className="mr-1 flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded px-1 text-[10px] text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent)]"
                        title="Toggle channel visibility"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!activeUserId || !activeWorkspaceId) return;
                          const isWorkspaceVisible = channel.visibility === "workspace";
                          runWorkspaceAction(updateChannel(activeUserId, activeWorkspaceId, channel.id, {
                            visibility: isWorkspaceVisible ? "members" : "workspace",
                            memberIds: isWorkspaceVisible ? [activeUserId] : [],
                          }));
                        }}
                      >
                        {channel.visibility === "members" ? "lock" : "open"}
                      </button>
                      <button
                        type="button"
                        className="rounded px-1 text-[10px] text-[var(--color-ink-faint)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-accent)]"
                        title="Create thread"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (activeUserId && activeWorkspaceId) runWorkspaceAction(addThread(activeUserId, activeWorkspaceId, channel.id, `${channel.name}-thread`));
                        }}
                      >
                        + hilo
                      </button>
                    </div>
                  }
                />
                {workspaceConfig.channels
                  .filter((thread) => thread.parentChannelId === channel.id && (thread.visibility === "workspace" || thread.memberIds.includes(activeUserId)))
                  .map((thread) => (
                    <div key={thread.id} className="ml-4">
                      <SidebarNavItem
                        icon={<GitBranch size={13} />}
                        label={thread.name}
                        active={activePage?.kind === "channel" && activePage.id === thread.id}
                        onClick={() => openPage({
                          id: thread.id,
                          workspaceId: activeWorkspaceId,
                          kind: "channel",
                          title: thread.name,
                        })}
                        rightElement={<span className="pr-2 text-[10px] text-[var(--color-ink-faint)]">thread</span>}
                      />
                    </div>
                  ))}
              </React.Fragment>
            ))
        )}
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

      <SidebarSection label="osionos apps">
        <SidebarNavItem
          icon={<Mail size={16} />}
          label="osionos Mail"
          onClick={() => {
            /* placeholder */
          }}
        />
        <SidebarNavItem
          icon={<CalendarRange size={16} />}
          label="osionos Calendar"
          onClick={() => {
            /* placeholder */
          }}
        />
        <SidebarNavItem
          icon={<Monitor size={16} />}
          label="osionos Desktop"
          onClick={() => {
            /* placeholder */
          }}
        />
      </SidebarSection>
    </div>
  );
};
