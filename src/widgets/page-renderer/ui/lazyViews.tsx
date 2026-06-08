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
  import("@/widgets/channel-messages/ui/ChannelMessagesView").then((m) => ({ default: m.ChannelMessagesView })),
);

export const LazyTrashView = lazy(() =>
  import("@/pages/trash-view/ui/TrashView").then((m) => ({ default: m.TrashView })),
);

export const LazyGraphEngineExplorer = lazy(() =>
  import("@/widgets/graph-explorer/GraphEngineExplorer").then((m) => ({ default: m.GraphEngineExplorer })),
);

export const LazyHomeWorkspaceMode = lazy(() =>
  import("@/widgets/home-variants/ui/HomeWorkspaceMode").then((m) => ({ default: m.HomeWorkspaceMode })),
);
