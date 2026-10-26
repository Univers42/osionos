/**
 * Which AI Hub section is selected, askable from outside the Hub: the "/"
 * palette and the Settings button open the Hub on a given section. The
 * selection is a store, not view state, so a request made while the Hub tab
 * is closed still lands when it mounts.
 */

import { create } from "zustand";

import { aiHubTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

export type HubSectionId = "overview" | "connections" | "usage" | "skills" | "memory" | "mcp" | "privacy";

interface AiHubNavState {
  section: HubSectionId;
  request: (section: HubSectionId) => void;
}

export const useAiHubNav = create<AiHubNavState>((set) => ({
  section: "overview",
  request: (section) => set({ section }),
}));

/** Opens the Hub on a section; openTab dedupes on the stable pageId, so an open Hub is focused. */
export function openAiHub(section: HubSectionId): void {
  useAiHubNav.getState().request(section);
  useWorkspaceLayout.getState().openTab(aiHubTab());
}
