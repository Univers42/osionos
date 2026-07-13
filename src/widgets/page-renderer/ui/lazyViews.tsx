/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   lazyViews.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Per-category code-split boundaries. Each pane/home surface (editor, database,
 * graph, gallery, channel, trash, agent) is its own async chunk so opening one
 * surface only downloads that surface's code — the dashboard no longer drags in
 * the graph engine + database + second brain. Deep import paths (not barrels)
 * keep each chunk minimal and prevent the heavy UI from leaking back into the
 * entry. Consumers wrap usage in <Suspense>.
 */

import { lazy } from "react";

export const LazyOsionosPage = lazy(() =>
  import("@/pages/notion-page/ui/NotionPage").then((m) => ({ default: m.OsionosPage })),
);

export const LazyAgentConversationPage = lazy(() =>
  import("@/widgets/agent-conversation/ui/AgentConversationPage").then((m) => ({ default: m.AgentConversationPage })),
);

export const LazyDatabaseBlock = lazy(() =>
  import("@/widgets/database-view/ui/DatabaseBlock").then((m) => ({ default: m.DatabaseBlock })),
);

export const LazyWorkspaceDatabaseBlock = lazy(() =>
  import("@/widgets/database-view/ui/WorkspaceDatabaseBlock").then((m) => ({ default: m.WorkspaceDatabaseBlock })),
);

export const LazyChannelMessagesView = lazy(() =>
  import("@/widgets/channel-messages/ui/ChannelPane").then((m) => ({ default: m.ChannelPane })),
);

export const LazyMessagesView = lazy(() =>
  import("@/widgets/messages-view/ui/MessagesView").then((m) => ({ default: m.MessagesView })),
);

export const LazyCollabBrowseView = lazy(() =>
  import("@/widgets/collab-browse/ui/CollabBrowseView").then((m) => ({ default: m.CollabBrowseView })),
);

export const LazyCommunityList = lazy(() =>
  import("@/features/communities/CommunityList").then((m) => ({ default: m.CommunityList })),
);

export const LazyEmbedAppView = lazy(() =>
  import("@/widgets/embed-app/ui/EmbedAppView").then((m) => ({ default: m.EmbedAppView })),
);

export const LazyTrashView = lazy(() =>
  import("@/pages/trash-view/ui/TrashView").then((m) => ({ default: m.TrashView })),
);

export const LazyProfileView = lazy(() =>
  import("@/widgets/profile-page/ProfileView").then((m) => ({ default: m.ProfileView })),
);

export const LazyProfilePageView = lazy(() =>
  import("@/widgets/profile-page/ProfilePageView").then((m) => ({ default: m.ProfilePageView })),
);

export const LazyGraphEngineExplorer = lazy(() =>
  import("@/widgets/graph-explorer/GraphEngineExplorer").then((m) => ({ default: m.GraphEngineExplorer })),
);

export const LazyHomeWorkspaceMode = lazy(() =>
  import("@/widgets/home-variants/ui/HomeWorkspaceMode").then((m) => ({ default: m.HomeWorkspaceMode })),
);

// The BaaS console is its own self-contained lazy boundary (Suspense lives
// inside the feature), re-exported here so PaneContent imports it like the rest.
export { LazyBaasConsoleView } from "@/features/baas-console";

export const LazyAdminSpaceView = lazy(() =>
  import("@/widgets/admin-space").then((m) => ({ default: m.AdminSpaceView })),
);

export const LazyChatShell = lazy(() =>
  import("@/widgets/chat-shell").then((m) => ({ default: m.ChatShell })),
);

// Deep import (never a barrel): the Draw surface pulls @osionos/draw-engine, a
// large canvas chunk that must never leak onto the warm pane path.
export const LazyDrawView = lazy(() =>
  import("@/widgets/draw-canvas/ui/DrawCanvasView").then((m) => ({ default: m.DrawCanvasView })),
);

// Deep import (never a barrel): the IDE editor pulls CodeMirror 6 + its language
// packs, a large chunk that must never leak onto the warm pane path. Only reached
// for surface==='code' pages when osio.ide is on (default OFF).
export const LazyCodeFileView = lazy(() =>
  import("@/features/ide/ui/CodeFileView").then((m) => ({ default: m.CodeFileView })),
);
