import React, { Suspense } from "react";

import { LoadingPane } from "@/shared/ui";
import { PANEL_LOADERS } from "@/widgets/activity-rail/ui/panelLoaders";
import type { PhoneTabId } from "../model/phoneStack";

const LazyExplorer = React.lazy(() =>
  Promise.all([
    import("@/widgets/activity-rail/ui/panels/ExplorerPanel"),
    import("@/widgets/activity-rail/model/openWorkspaceEntry"),
  ]).then(([panel, entry]) => ({ default: () => <panel.ExplorerPanel onOpenFile={entry.openWorkspaceEntry} /> })),
);
const LazySearch = React.lazy(PANEL_LOADERS.search);
const LazyInbox = React.lazy(PANEL_LOADERS.notifications);
const LazyAgent = React.lazy(PANEL_LOADERS.assistant);

const VIEWS: Readonly<Record<PhoneTabId, React.LazyExoticComponent<React.ComponentType>>> = Object.freeze({
  home: LazyExplorer,
  search: LazySearch,
  inbox: LazyInbox,
  agent: LazyAgent,
});

/** A tab's root view: the sidebar's own panel, full width. Mounted once the tab is first shown. */
export const PhoneTabView: React.FC<{ tab: PhoneTabId }> = ({ tab }) => {
  const View = VIEWS[tab];
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-[var(--osio-bg-page)]">
      <Suspense fallback={<LoadingPane />}>
        <View />
      </Suspense>
    </div>
  );
};
