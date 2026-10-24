/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   settingsNav.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Dispatch for "open settings" once shared by the App's local state and three
// private modal copies. One store holds WHERE to land ({ section, anchor }); the
// open tab itself lives in the workspace layout store, so every surface opens —
// or focuses — the same pane tab and no surface keeps settings state of its own.
// The destination is session state (defaults to Profile on a reload): the tab
// strip restores the tab, not the last section you were on.

import { create } from "zustand";

import { settingsTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

import type { SettingsSectionId } from "./sections";

interface SettingsNavState {
  /** The section the (single, possibly duplicated) settings view shows. */
  section: SettingsSectionId;
  /** Pending search result: scrolled to and cleared once the panel is shown. */
  anchor: string | null;
  open: (section?: SettingsSectionId, anchor?: string) => void;
  /** Switching section starts a new navigation context: a pending anchor
   *  belongs to the section that requested it, not to the one clicked. */
  setSection: (section: SettingsSectionId) => void;
  clearAnchor: () => void;
}

export const useSettingsNav = create<SettingsNavState>((set) => ({
  section: "profile",
  anchor: null,
  open: (section = "profile", anchor) => {
    set({ section, anchor: anchor ?? null });
    useWorkspaceLayout.getState().openTab(settingsTab());
  },
  setSection: (section) =>
    set((state) => (state.section === section ? state : { section, anchor: null })),
  clearAnchor: () => set({ anchor: null }),
}));

/** Open or focus the settings tab. `anchor` names a `[data-settings-anchor]`
 *  inside the section's panel that the view scrolls to after it renders. */
export function openSettings(section: SettingsSectionId = "profile", anchor?: string): void {
  useSettingsNav.getState().open(section, anchor);
}
