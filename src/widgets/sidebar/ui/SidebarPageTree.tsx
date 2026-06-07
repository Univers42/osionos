/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarPageTree.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/05 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 13:52:58 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useRef } from "react";
import { Plus, FolderPlus, Mail, CalendarRange, Monitor, Hash, Lock, MessageSquare, Volume2, Video, GitBranch, Archive, Bot } from "lucide-react";
import { AssetRenderer } from "@univers42/ui-collection";
import { useShallow } from "zustand/react/shallow";

import type { ActivePage, PageEntry } from "@/entities/page";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarSection } from "./SidebarSection";
import { PageTreeItem } from "./PageTreeItem";
import { PageOptionsMenu } from "@/features/page-management";
import { usePageStore } from "@/store/usePageStore";
import {
  canReadPage,
  usePageAccessContext,
} from "@/shared/lib/auth/pageAccess";
import { isPerfEnabled } from "@/shared/lib/perf/measure";
import { useUserStore } from "@/features/auth";
import {
  resolveWorkspaceConfig,
  useWorkspaceConfigStore,
  type WorkspaceChannel,
  type WorkspaceChannelType,
  workspaceConfigKey,
} from "@/shared/config/workspaceConfigStore";

const OSIONOS_MAIL_URL = ((import.meta.env as Record<string, string>)['VITE_MAIL_APP_URL'] ?? 'http://localhost:3002').trim();
const OSIONOS_CALENDAR_URL = ((import.meta.env as Record<string, string>)['VITE_CALENDAR_APP_URL'] ?? 'http://localhost:3003').trim();
const EMPTY_PAGE_IDS: readonly string[] = [];
const EMPTY_WORKSPACE_PAGES: readonly PageEntry[] = [];
type PageStoreState = ReturnType<typeof usePageStore.getState>;
type RootPageBucket = "agent" | "private" | "owned-shared" | "shared-workspace";

function selectPageAccessEntry(state: PageStoreState, pageId: string): PageEntry | null {
  const index = state.pagesIndex[pageId];
  const page = index ? state.pages[index.workspaceId]?.[index.index] : undefined;
  if (!page) return null;
  return {
    _id: page._id,
    title: page.title,
    workspaceId: page.workspaceId,
    ownerId: page.ownerId,
    visibility: page.visibility,
    collaborators: page.collaborators,
  };
}

function selectRootPageIds(
  pages: readonly PageEntry[],
  bucket: RootPageBucket,
  accessContext: ReturnType<typeof usePageAccessContext>,
): string[] {
  return pages
    .filter((page) => {
      if (page.parentPageId || page.archivedAt || !canReadPage(page, accessContext)) return false;
      if (bucket === "agent") return page.surface === "agent";
      if (bucket === "private") return page.surface !== "agent" && page.surface !== "home" && page.visibility !== "shared";
      if (bucket === "owned-shared") return page.surface !== "agent" && page.surface !== "home" && page.visibility === "shared";
      return page.surface !== "home";
    })
    .map((page) => page._id);
}

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
  const page = usePageStore(useShallow((s) => selectPageAccessEntry(s, recent.id)));
  const accessContext = usePageAccessContext();

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
        className="p-1 rounded hover:bg-[var(--osio-bg-subtle)]"
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
  const page = usePageStore(useShallow((s) => selectPageAccessEntry(s, recent.id)));
  const accessContext = usePageAccessContext();

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
  activePageId: string | null;
  activePageKind: ActivePage["kind"] | null;
  activeWorkspaceId: string;
  openPage: (page: ActivePage) => void;
  privateWorkspaces: WorkspaceRef[];
  sharedWorkspaces: WorkspaceRef[];
  jwt: string;
  onAddToWorkspace: (wsId: string) => void;
}

function runWorkspaceAction(action: Promise<unknown>) {
  action.catch((error: unknown) => {
    console.error("[SidebarPageTree] Workspace action failed", error);
  });
}

function openExternalApp(url: string) {
  const destination = url.replace(/\/+$/, "");
  if (!destination) return;
  const opened = globalThis.open(destination, "_blank");
  if (opened) {
    opened.opener = null;
    return;
  }
  globalThis.location.href = destination;
}

const CHANNEL_CATEGORIES: Array<{
  label: string;
  types: WorkspaceChannelType[];
  createType: WorkspaceChannelType;
  createName: string;
}> = [
  { label: "Text channels", types: ["text", "forum"], createType: "text", createName: "messages" },
  { label: "Voice rooms", types: ["audio", "video", "stage"], createType: "audio", createName: "audio" },
  { label: "Automation", types: ["agent"], createType: "agent", createName: "agent-room" },
  { label: "Archive", types: ["archive"], createType: "archive", createName: "archive" },
];

function channelTypeLabel(type: WorkspaceChannelType): string {
  if (type === "forum") return "forum";
  if (type === "audio") return "voice";
  if (type === "video") return "video";
  if (type === "stage") return "stage";
  if (type === "archive") return "archive";
  if (type === "agent") return "agent";
  if (type === "thread") return "thread";
  return "text";
}

/** Scrollable page-tree area: Recents, Agents, Private, Shared, osionos apps. */
export const SidebarPageTree: React.FC<SidebarPageTreeProps> = ({
  recents,
  activePageId,
  activePageKind,
  activeWorkspaceId,
  openPage,
  privateWorkspaces,
  sharedWorkspaces,
  jwt,
  onAddToWorkspace,
}) => {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => () => {
    if (isPerfEnabled()) {
      console.info(`[perf] SidebarPageTree renders before unmount: ${renderCountRef.current}`);
    }
  }, []);

  const addPage = usePageStore((s) => s.addPage);
  const activeUserId = useUserStore((s) => s.activeUserId);
  const workspaceKey = workspaceConfigKey(activeUserId || "anonymous", activeWorkspaceId || "workspace");
  const storedWorkspaceConfig = useWorkspaceConfigStore((s) => s.configs[workspaceKey]);
  const workspaceConfig = useMemo(() => resolveWorkspaceConfig(storedWorkspaceConfig), [storedWorkspaceConfig]);
  const addChannel = useWorkspaceConfigStore((s) => s.addChannel);
  const addThread = useWorkspaceConfigStore((s) => s.addThread);
  const updateChannel = useWorkspaceConfigStore((s) => s.updateChannel);
  const accessContext = usePageAccessContext();
  const safeActiveUserId = activeUserId || "anonymous";
  const workspacePagesKey = activeWorkspaceId || "";
  const agentPageIds = usePageStore(useShallow((s) => selectRootPageIds(s.pages[workspacePagesKey] ?? EMPTY_WORKSPACE_PAGES, "agent", accessContext)));
  const privatePageIds = usePageStore(useShallow((s) => selectRootPageIds(s.pages[workspacePagesKey] ?? EMPTY_WORKSPACE_PAGES, "private", accessContext)));
  const ownedSharedPageIds = usePageStore(useShallow((s) => selectRootPageIds(s.pages[workspacePagesKey] ?? EMPTY_WORKSPACE_PAGES, "owned-shared", accessContext)));
  const sharedWorkspaceRootPageIds = usePageStore(useShallow((s) => (
    sharedWorkspaces.length > 0
      ? selectRootPageIds(s.pages[workspacePagesKey] ?? EMPTY_WORKSPACE_PAGES, "shared-workspace", accessContext)
      : EMPTY_PAGE_IDS
  )));

  const rootChannels = useMemo(
    () => workspaceConfig.channels.filter((channel) => !channel.parentChannelId),
    [workspaceConfig.channels],
  );
  const visibleRootChannels = useMemo(
    () => rootChannels.filter((channel) => channel.visibility === "workspace" || channel.memberIds.includes(safeActiveUserId)),
    [rootChannels, safeActiveUserId],
  );

  function channelIcon(type: WorkspaceChannelType, restricted: boolean) {
    if (restricted) return <Lock size={14} />;
    if (type === "thread") return <GitBranch size={14} />;
    if (type === "forum") return <MessageSquare size={14} />;
    if (type === "audio" || type === "stage") return <Volume2 size={14} />;
    if (type === "video") return <Video size={14} />;
    if (type === "archive") return <Archive size={14} />;
    if (type === "agent") return <Bot size={14} />;
    return <Hash size={14} />;
  }

  function openChannel(channel: WorkspaceChannel) {
    openPage({
      id: channel.id,
      workspaceId: activeWorkspaceId,
      kind: "channel",
      title: channel.name,
    });
  }

  function createChannel(type: WorkspaceChannelType, name: string, parentChannelId?: string | null) {
    if (!activeWorkspaceId) return;
    runWorkspaceAction(addChannel(safeActiveUserId, activeWorkspaceId, name, type, parentChannelId ?? null));
  }

  function visibleThreadsFor(channelId: string) {
    return workspaceConfig.channels.filter((thread) => (
      thread.parentChannelId === channelId &&
      (thread.visibility === "workspace" || thread.memberIds.includes(safeActiveUserId))
    ));
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

  async function createAndOpenPage(workspaceId: string, title: string, options?: Parameters<typeof addPage>[4]) {
    if (!workspaceId) return;
    const page = await addPage(workspaceId, title, jwt, undefined, options);
    if (!page) return;
    openPage({
      id: page._id,
      workspaceId,
      kind: "page",
      title: page.title,
      icon: page.icon,
    });
  }

  function createSharedPage() {
    void createAndOpenPage(activeWorkspaceId, "Shared page", { visibility: "shared" });
  }

  function createRootFolder(workspaceId: string, visibility: "private" | "shared") {
    if (!workspaceId) return;
    // A folder never opens, so we create it without navigating to it.
    void addPage(workspaceId, "New folder", jwt, undefined, { surface: "folder", visibility });
  }

  function createAgentPage() {
    void createAndOpenPage(activeWorkspaceId, "New agent", {
      icon: "icon:sparkles",
      surface: "agent",
      visibility: "private",
      content: [
        {
          id: `block-${crypto.randomUUID()}`,
          type: "paragraph",
          content: "Describe this agent's job, tools, and boundaries.",
        },
      ],
    });
  }

  function handleToggleChannelVisibility(event: React.MouseEvent, channel: WorkspaceChannel) {
    event.stopPropagation();
    if (!activeWorkspaceId) return;
    const isWorkspaceVisible = channel.visibility === "workspace";
    runWorkspaceAction(updateChannel(safeActiveUserId, activeWorkspaceId, channel.id, {
      visibility: isWorkspaceVisible ? "members" : "workspace",
      memberIds: isWorkspaceVisible ? [safeActiveUserId] : [],
    }));
  }

  function handleCreateThread(event: React.MouseEvent, channel: WorkspaceChannel) {
    event.stopPropagation();
    if (activeWorkspaceId) {
      runWorkspaceAction(addThread(safeActiveUserId, activeWorkspaceId, channel.id, `${channel.name}-thread`));
    }
  }

  function renderThread(thread: WorkspaceChannel) {
    return (
      <div key={thread.id} className="ml-4">
        <SidebarNavItem
          icon={<GitBranch size={13} />}
          label={thread.name}
          active={activePageKind === "channel" && activePageId === thread.id}
          onClick={() => openChannel(thread)}
          rightElement={<span className="pr-2 text-[10px] uppercase text-[var(--osio-fg-subtle)]">thread</span>}
        />
      </div>
    );
  }

  function renderChannel(channel: WorkspaceChannel) {
    return (
      <React.Fragment key={channel.id}>
        <SidebarNavItem
          icon={channelIcon(channel.type, channel.visibility === "members")}
          label={channel.name}
          active={activePageKind === "channel" && activePageId === channel.id}
          onClick={() => openChannel(channel)}
          rightElement={
            <div className="mr-1 flex items-center gap-0.5">
              <span className="hidden rounded bg-[var(--osio-bg-muted)] px-1.5 py-0.5 text-[10px] text-[var(--osio-fg-subtle)] group-hover:inline sm:inline">
                {channelTypeLabel(channel.type)}
              </span>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--osio-fg-subtle)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-accent)]"
                title="Toggle channel visibility"
                onClick={(event) => handleToggleChannelVisibility(event, channel)}
              >
                {channel.visibility === "members" ? <Lock size={12} /> : <Hash size={12} />}
              </button>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--osio-fg-subtle)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-accent)]"
                title="Create thread"
                onClick={(event) => handleCreateThread(event, channel)}
              >
                <GitBranch size={12} />
              </button>
            </div>
          }
        />
        {visibleThreadsFor(channel.id).map(renderThread)}
      </React.Fragment>
    );
  }

  function renderChannelCategory(category: (typeof CHANNEL_CATEGORIES)[number]) {
    const categoryChannels = visibleRootChannels.filter((channel) => category.types.includes(channel.type));
    if (categoryChannels.length === 0) return null;

    return (
      <div key={category.label} className="mb-2">
        <div className="mb-0.5 flex items-center justify-between px-2 text-[10px] font-semibold uppercase text-[var(--osio-fg-subtle)]">
          <span>{category.label}</span>
          <button
            type="button"
            title={`Create ${category.label.toLowerCase()}`}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-accent)]"
            onClick={() => createChannel(category.createType, category.createName)}
          >
            <Plus size={12} />
          </button>
        </div>
        {categoryChannels.map(renderChannel)}
      </div>
    );
  }

  function renderChannelCategories() {
    if (visibleRootChannels.length === 0) {
      return (
        <p className="px-2 py-1 text-xs text-[var(--osio-fg-subtle)] italic">
          Add messages, threads, audio or video channels.
        </p>
      );
    }

    return CHANNEL_CATEGORIES.map(renderChannelCategory);
  }

  return (
    <div className="flex flex-col gap-3">
      <SidebarSection label="Recents">
        {recents.length > 0 ? (
          recents
            .slice(0, 8)
            .map((r) => (
              <RecentSidebarItem
                key={r.id}
                recent={r}
                activePageId={activePageId}
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
          <p className="px-2 py-1 text-xs text-[var(--osio-fg-subtle)] italic">
            Pages you visit will appear here
          </p>
        )}
      </SidebarSection>

      <SidebarSection label="Agents" onAdd={createAgentPage}>
        {agentPageIds.map((pageId) => (
          <PageTreeItem
            key={pageId}
            pageId={pageId}
            workspaceId={activeWorkspaceId}
            jwt={jwt}
            depth={0}
            activeId={activePageId}
          />
        ))}
        <SidebarNavItem
          icon={<Plus size={14} />}
          label="New agent"
          subtle
          onClick={createAgentPage}
        />
      </SidebarSection>

      <SidebarSection
        label="Channels"
        defaultOpen
        onAdd={() => {
          createChannel("text", "general");
        }}
      >
        <div className="mb-2 grid grid-cols-4 gap-1 px-1">
          <button type="button" title="Create text channel" className="flex h-8 items-center justify-center rounded-md text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]" onClick={() => createChannel("text", "messages")}><Hash size={15} /></button>
          <button type="button" title="Create forum" className="flex h-8 items-center justify-center rounded-md text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]" onClick={() => createChannel("forum", "forum")}><MessageSquare size={15} /></button>
          <button type="button" title="Create voice room" className="flex h-8 items-center justify-center rounded-md text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]" onClick={() => createChannel("audio", "audio")}><Volume2 size={15} /></button>
          <button type="button" title="Create video room" className="flex h-8 items-center justify-center rounded-md text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]" onClick={() => createChannel("video", "video")}><Video size={15} /></button>
        </div>
        {renderChannelCategories()}
      </SidebarSection>

      {privateWorkspaces.map((ws) => {
        const pageIds = ws._id === activeWorkspaceId ? privatePageIds : EMPTY_PAGE_IDS;
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
            {pageIds.length === 0 && (
              <p className="px-2 py-1 text-xs text-[var(--osio-fg-subtle)] italic">
                No pages yet
              </p>
            )}
            {pageIds.map((pageId) => (
              <PageTreeItem
                key={pageId}
                pageId={pageId}
                workspaceId={ws._id}
                jwt={jwt}
                depth={0}
                activeId={activePageId}
              />
            ))}
            <SidebarNavItem
              icon={<FolderPlus size={14} />}
              label="New folder"
              subtle
              onClick={() => createRootFolder(ws._id, "private")}
            />
          </SidebarSection>
        );
      })}

      <SidebarSection label="Shared" onAdd={createSharedPage}>
        {ownedSharedPageIds.map((pageId) => (
          <PageTreeItem
            key={pageId}
            pageId={pageId}
            workspaceId={activeWorkspaceId}
            jwt={jwt}
            depth={0}
            activeId={activePageId}
          />
        ))}
        {sharedWorkspaceRootPageIds.map((pageId) => (
          <PageTreeItem
            key={pageId}
            pageId={pageId}
            workspaceId={activeWorkspaceId}
            jwt={jwt}
            depth={0}
            activeId={activePageId}
          />
        ))}
        {ownedSharedPageIds.length === 0 && sharedWorkspaceRootPageIds.length === 0 ? (
          <SidebarNavItem
            icon={<Plus size={14} className="text-[var(--osio-accent)]" />}
            label="Start collaborating"
            subtle
            onClick={createSharedPage}
          />
        ) : null}
        <SidebarNavItem
          icon={<FolderPlus size={14} />}
          label="New folder"
          subtle
          onClick={() => createRootFolder(activeWorkspaceId, "shared")}
        />
      </SidebarSection>

      <SidebarSection label="osionos apps">
        <SidebarNavItem
          icon={<Mail size={16} />}
          label="osionos Mail"
          onClick={() => openExternalApp(OSIONOS_MAIL_URL)}
        />
        <SidebarNavItem
          icon={<CalendarRange size={16} />}
          label="osionos Calendar"
          onClick={() => openExternalApp(OSIONOS_CALENDAR_URL)}
        />
        <SidebarNavItem
          icon={<Monitor size={16} />}
          label="osionos Desktop"
          onClick={() => {
            globalThis.location.href = "/";
          }}
        />
      </SidebarSection>
    </div>
  );
};
