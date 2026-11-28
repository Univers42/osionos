import React, { Suspense } from "react";

import { Plus } from "lucide-react";

import { LoadingPane } from "@/shared/ui";
import { CommandSearch } from "@/widgets/top-bar";
import { openSettings } from "@/features/settings/model/settingsNav";
import { createPage } from "@/widgets/top-bar/model/menus/newPageAction";
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

/** The Home tab's 56px "New page" button, above the tab bar: the same action the desktop File menu runs, which then opens (and so pushes) the page. */
const NewPageButton: React.FC = () => (
  <button
    type="button"
    aria-label="New page"
    onClick={() => createPage("Untitled")}
    className="absolute bottom-20 right-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] shadow-osio-e3 focus-visible:ring-2 focus-visible:ring-[var(--osio-fg-default)]"
  >
    <Plus size={24} aria-hidden />
  </button>
);

/** The palette on top of the Search tab: pages, commands, settings (':') and people ('user:'), as on desktop. */
const SearchTabHeader: React.FC = () => (
  <div className="shrink-0 px-3 py-2">
    <CommandSearch onOpenSettings={openSettings} touch />
  </div>
);

/** A tab's root view: the sidebar's own panel, full width; Home keeps 144px clear below it for the New page button and the chat dock. Mounted once the tab is first shown. */
export const PhoneTabView: React.FC<{ tab: PhoneTabId }> = ({ tab }) => {
  const View = VIEWS[tab];
  return (
    <div className="relative h-full w-full">
      <div className={`flex h-full min-h-0 w-full flex-col overflow-y-auto bg-[var(--osio-bg-page)] ${tab === "home" ? "pb-36" : ""}`}>
        {tab === "search" && <SearchTabHeader />}
        <Suspense fallback={<LoadingPane />}>
          <View />
        </Suspense>
      </div>
      {tab === "home" && <NewPageButton />}
    </div>
  );
};
