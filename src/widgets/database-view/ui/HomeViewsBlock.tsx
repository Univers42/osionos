/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   HomeViewsBlock.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { useUserStore } from "@/features/auth";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { genId } from "@/widgets/workspace-grid/model/layoutTree";
import {
  SHOWCASE_VIEW_IDS,
  VIEW_TYPE_ICONS,
  VIEW_TYPE_LABELS,
  getKnownDatabaseView,
  type KnownDatabaseView,
} from "../model/databaseViewCatalog.meta";

/** Curated catalog views grouped by their database, order preserved. */
function groupedViews(): KnownDatabaseView[][] {
  const byDatabase = new Map<string, KnownDatabaseView[]>();
  for (const viewId of SHOWCASE_VIEW_IDS) {
    const view = getKnownDatabaseView(viewId);
    if (!view) continue;
    const group = byDatabase.get(view.databaseId);
    if (group) group.push(view);
    else byDatabase.set(view.databaseId, [view]);
  }
  return [...byDatabase.values()];
}

function openView(view: KnownDatabaseView): void {
  const workspaceId = useUserStore.getState().activeWorkspace()?._id ?? "";
  // pageId is the VIEW id (unique) so two views of one database open as
  // distinct tabs; databaseId + viewId drive the full DatabaseBlock.
  useWorkspaceLayout.getState().openTab({
    tabId: genId("tab"),
    pageId: view.id,
    workspaceId,
    kind: "database",
    title: `${view.databaseName} · ${view.name}`,
    icon: "icon:database",
    databaseId: view.databaseId,
    viewId: view.id,
  });
}

/** A "view launcher": curated DB views grouped by database, each row opens that
 *  view as a full database tab. Reads only the pure catalog meta (no seed
 *  state), so it stays cheap on the Home canvas. */
export const HomeViewsBlock: React.FC = () => {
  const groups = React.useMemo(() => groupedViews(), []);
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
      {groups.map((views, groupIndex) => (
        <div key={views[0].databaseId}>
          {groupIndex > 0 ? <div className="border-t border-[var(--osio-border-default)]" /> : null}
          <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">
            {views[0].databaseName}
          </div>
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => openView(view)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--osio-bg-hover)]"
            >
              <span aria-hidden="true" className="w-4 shrink-0 text-center text-[var(--osio-fg-muted)]">
                {VIEW_TYPE_ICONS[view.type]}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">{view.name}</span>
              <span className="shrink-0 rounded-full bg-[var(--osio-bg-hover)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--osio-fg-muted)]">
                {VIEW_TYPE_LABELS[view.type]}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};
