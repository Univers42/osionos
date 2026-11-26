import { isPaneZoomEnabled } from "@/shared/config/featureFlags";
import { toggleZenWithExitHint } from "@/shared/config/useZenMode";
import { openSettings } from "@/features/settings/model/settingsNav";
import { usePalette } from "@/widgets/top-bar/model/usePalette";
import { findPane } from "@/widgets/workspace-grid/model/layoutTree";
import { getSelectedPaneId, type PaneZoomChange } from "@/widgets/workspace-grid/model/paneZoom";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { startNewPage } from "@/widgets/workspace-grid/model/startActions";
import { openAndFocusPanel, openMachineFolder } from "@/widgets/activity-rail/model/panelFocus";
import { useUIStore } from "@/shared/config/uiStore";
import { useIssueReportRequest } from "@/features/issues/model/issueReportRequest";

import type { Command } from "../types";

/** App-shell commands — the same actions the top bar already exposes, wrapped. */
/** The selected pane, if it is still open. Null hands the key back to the browser. */
function zoomablePaneId(): string | null {
  if (!isPaneZoomEnabled()) return null;
  const paneId = getSelectedPaneId();
  return paneId && findPane(useWorkspaceLayout.getState().root, paneId) ? paneId : null;
}

function zoomSelectedPane(change: PaneZoomChange): void {
  const paneId = zoomablePaneId();
  if (paneId) useWorkspaceLayout.getState().zoomPane(paneId, change);
}

/**
 * Zen from the Ctrl+K Ctrl+Z chord: the chord's first step (mod+k) also opens
 * Search, so close it before toggling.
 */
function toggleZenFromChord(): void {
  usePalette.getState().close();
  toggleZenWithExitHint();
}

export const APP_COMMANDS: Command[] = [
  { id: "openSearch", title: "Search", category: "App", run: () => usePalette.getState().openSearch() },
  { id: "openPalette", title: "Command palette", category: "App", run: () => usePalette.getState().openCommand() },
  { id: "openSettings", title: "Settings", category: "App", run: () => openSettings() },
  { id: "reportIssue", title: "Report an issue", category: "App", run: () => useIssueReportRequest.getState().open({ title: "", description: "" }) },
  { id: "newPage", title: "New page", category: "App", run: () => void startNewPage() },
  { id: "toggleSidebar", title: "Show or hide the sidebar", category: "App", run: () => useUIStore.getState().toggleDocked() },
  { id: "openSearchPanel", title: "Search panel", category: "App", run: () => openAndFocusPanel("search") },
  { id: "openFolder", title: "Open Folder…", category: "App", run: openMachineFolder },
  { id: "focusExplorer", title: "Explorer", category: "App", run: () => openAndFocusPanel("files") },
  { id: "focusConversations", title: "Conversations", category: "App", run: () => openAndFocusPanel("conversations") },
  {
    id: "toggleZenMode",
    title: "Toggle Zen mode",
    category: "App",
    run: toggleZenFromChord,
  },
  {
    id: "splitPane",
    title: "Split pane right",
    category: "App",
    run: () => {
      const layout = useWorkspaceLayout.getState();
      layout.splitActivePane(layout.activePaneId, "row");
    },
  },
  { id: "zoomPaneIn", title: "Zoom in (selected pane)", category: "App", enabled: () => zoomablePaneId() !== null, run: () => zoomSelectedPane("in") },
  { id: "zoomPaneOut", title: "Zoom out (selected pane)", category: "App", enabled: () => zoomablePaneId() !== null, run: () => zoomSelectedPane("out") },
  { id: "zoomPaneReset", title: "Reset zoom (selected pane)", category: "App", enabled: () => zoomablePaneId() !== null, run: () => zoomSelectedPane("reset") },
];
