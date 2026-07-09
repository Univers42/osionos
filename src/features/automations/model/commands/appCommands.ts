import { usePalette } from "@/widgets/top-bar/model/usePalette";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

import type { Command } from "../types";

/** App-shell commands — the same actions the top bar already exposes, wrapped. */
export const APP_COMMANDS: Command[] = [
  { id: "openSearch", title: "Search", category: "App", run: () => usePalette.getState().openSearch() },
  { id: "openPalette", title: "Command palette", category: "App", run: () => usePalette.getState().openCommand() },
  {
    id: "splitPane",
    title: "Split pane right",
    category: "App",
    run: () => {
      const layout = useWorkspaceLayout.getState();
      layout.splitActivePane(layout.activePaneId, "row");
    },
  },
];
