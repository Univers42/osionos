import { create } from "zustand";
import { persist } from "zustand/middleware";

import { comboSteps } from "./combo";
import { DEFAULT_AUTOMATIONS } from "./defaultAutomations";
import type { Automation } from "./types";

/**
 * The durable shortcut store: DEFAULT_AUTOMATIONS layered with user `overrides`
 * (a full replacement per id) plus user-added `custom` automations. Persists to
 * localStorage (the house settings pattern) so rebindings survive a reload and
 * export/import is plain JSON — the user's shareable "config file".
 */
interface AutomationPatch extends Partial<Omit<Automation, "trigger">> {
  trigger?: Partial<Automation["trigger"]>;
}

interface AutomationStoreState {
  overrides: Record<string, Automation>;
  custom: Automation[];
  automations: () => Automation[];
  updateAutomation: (id: string, patch: AutomationPatch) => void;
  toggleEnabled: (id: string) => void;
  resetBinding: (id: string) => void;
  resetAll: () => void;
  addAutomation: () => void;
  removeAutomation: (id: string) => void;
  exportJson: () => string;
  importJson: (json: string) => boolean;
  conflicts: () => Set<string>;
}

function baseById(id: string): Automation | undefined {
  return DEFAULT_AUTOMATIONS.find((automation) => automation.id === id);
}

function conflictKey(automation: Automation): string {
  // Chord-aware: normalizeComboString only splits on "+", so it would mangle
  // "mod+k mod+z" down to "mod+z" and falsely report a clash with Undo.
  return `${comboSteps(automation.trigger.combo).join(" ")}::${automation.trigger.when}`;
}

/** Ids of enabled automations that share a combo + condition with another enabled one. */
export function computeConflicts(list: Automation[]): Set<string> {
  const counts = new Map<string, number>();
  for (const automation of list) {
    if (!automation.enabled || !automation.trigger.combo) continue;
    counts.set(conflictKey(automation), (counts.get(conflictKey(automation)) ?? 0) + 1);
  }
  const conflicted = new Set<string>();
  for (const automation of list) {
    if (automation.enabled && automation.trigger.combo && (counts.get(conflictKey(automation)) ?? 0) > 1) {
      conflicted.add(automation.id);
    }
  }
  return conflicted;
}

export const useAutomationStore = create<AutomationStoreState>()(
  persist(
    (set, get) => ({
      overrides: {},
      custom: [],
      automations: () => {
        const { overrides, custom } = get();
        return [...DEFAULT_AUTOMATIONS.map((automation) => overrides[automation.id] ?? automation), ...custom];
      },
      updateAutomation: (id, patch) =>
        set((state) => {
          const current = state.overrides[id] ?? baseById(id) ?? state.custom.find((automation) => automation.id === id);
          if (!current) return state;
          const next: Automation = { ...current, ...patch, trigger: { ...current.trigger, ...(patch.trigger ?? {}) } };
          if (state.custom.some((automation) => automation.id === id)) {
            return { custom: state.custom.map((automation) => (automation.id === id ? next : automation)) };
          }
          return { overrides: { ...state.overrides, [id]: next } };
        }),
      toggleEnabled: (id) => {
        const current = get().overrides[id] ?? baseById(id) ?? get().custom.find((automation) => automation.id === id);
        if (current) get().updateAutomation(id, { enabled: !current.enabled });
      },
      resetBinding: (id) =>
        set((state) => {
          if (state.custom.some((automation) => automation.id === id)) {
            return { custom: state.custom.filter((automation) => automation.id !== id) };
          }
          const nextOverrides = { ...state.overrides };
          delete nextOverrides[id];
          return { overrides: nextOverrides };
        }),
      resetAll: () => set({ overrides: {}, custom: [] }),
      addAutomation: () =>
        set((state) => ({
          custom: [
            ...state.custom,
            {
              id: crypto.randomUUID(),
              name: "New shortcut",
              enabled: true,
              trigger: { type: "keyboard", combo: "", when: "always" },
              actions: [{ type: "run_command", commandId: "openSearch" }],
            },
          ],
        })),
      removeAutomation: (id) =>
        set((state) => ({
          custom: state.custom.filter((automation) => automation.id !== id),
          overrides: Object.fromEntries(Object.entries(state.overrides).filter(([key]) => key !== id)),
        })),
      exportJson: () => JSON.stringify({ overrides: get().overrides, custom: get().custom }, null, 2),
      importJson: (json) => {
        try {
          const parsed = JSON.parse(json) as { overrides?: Record<string, Automation>; custom?: Automation[] };
          set({ overrides: parsed.overrides ?? {}, custom: Array.isArray(parsed.custom) ? parsed.custom : [] });
          return true;
        } catch {
          return false;
        }
      },
      conflicts: () => computeConflicts(get().automations()),
    }),
    { name: "osionos:settings:automations", partialize: (state) => ({ overrides: state.overrides, custom: state.custom }) },
  ),
);
