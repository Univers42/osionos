// The Explorer's two sources and what the person left open. Layout only: what is on a machine stays
// in that machine's frame.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const CLOUD_SECTION = "cloud";
export const MACHINE_SECTION = "machine";

type SectionId = typeof CLOUD_SECTION | typeof MACHINE_SECTION;

type MachineExplorerState = {
  collapsed: Record<SectionId, boolean>;
  weight: Record<SectionId, number>;
  /** This browser has opened the machine section before: it may reconnect on its own. */
  used: boolean;
  /** Bumps on every "Open Folder": the section hands it to its frame. Not persisted. */
  openFolderRequests: number;
  toggle(id: SectionId): void;
  resize(upperId: SectionId, upperWeight: number, lowerId: SectionId, lowerWeight: number): void;
  requestOpenFolder(): void;
  markUsed(): void;
};

export const useMachineExplorer = create<MachineExplorerState>()(persist((set) => ({
  collapsed: { [CLOUD_SECTION]: false, [MACHINE_SECTION]: true },
  weight: { [CLOUD_SECTION]: 1, [MACHINE_SECTION]: 1 },
  used: false,
  openFolderRequests: 0,
  toggle: (id) => set((state) => ({ collapsed: { ...state.collapsed, [id]: !state.collapsed[id] } })),
  resize: (upperId, upperWeight, lowerId, lowerWeight) => set((state) => ({ weight: { ...state.weight, [upperId]: upperWeight, [lowerId]: lowerWeight } })),
  requestOpenFolder: () => set((state) => ({
    collapsed: { ...state.collapsed, [MACHINE_SECTION]: false },
    openFolderRequests: state.openFolderRequests + 1,
  })),
  markUsed: () => set({ used: true }),
}), {
  name: "osionos:machine-explorer",
  storage: createJSONStorage(() => localStorage),
  partialize: ({ collapsed, weight, used }) => ({ collapsed, weight, used }),
}));
