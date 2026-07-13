import { useZenMode } from "@/shared/config/useZenMode";
import { useToastStore } from "@/shared/ui/primitives/useToastStore";
import { usePalette } from "@/widgets/top-bar/model/usePalette";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

import type { Command } from "../types";

/** App-shell commands — the same actions the top bar already exposes, wrapped. */
export const APP_COMMANDS: Command[] = [
  { id: "openSearch", title: "Search", category: "App", run: () => usePalette.getState().openSearch() },
  { id: "openPalette", title: "Command palette", category: "App", run: () => usePalette.getState().openCommand() },
  {
    id: "toggleZenMode",
    title: "Toggle Zen mode",
    category: "App",
    run: () => {
      // The chord's first step (mod+k) also opens Search — undo that.
      usePalette.getState().close();
      useZenMode.getState().toggle();
      if (!useZenMode.getState().zen) return;
      // An escape route: zen hides the chrome, so name the way out.
      useToastStore.getState().push({
        kind: "info",
        title: "Zen mode",
        description: "Press Ctrl+K Ctrl+Z to exit",
        action: { label: "Exit", onClick: () => useZenMode.getState().exit() },
      });
    },
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
];
