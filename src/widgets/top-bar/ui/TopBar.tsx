/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TopBar.tsx                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";
import type { SettingsSectionId } from "@/features/settings/model/sections";
import { useUIStore } from "@/shared/config/uiStore";
import { buildCommands, type PaletteCommand } from "../model/commands";
import { buildMenus } from "../model/menus";
import { usePalette, useTopBarHotkeys } from "../model/usePalette";
import { SharedSpacePresenceBar } from "@/features/collab/ui/SharedSpacePresenceBar";
import { AgentButton } from "./AgentButton";
import { LayoutToggles } from "./LayoutToggles";
import { PhoneMenu } from "./PhoneMenu";
import { TopBarMenu } from "./TopBarMenu";
import { TopBarSearch } from "./TopBarSearch";
import { UpdateButton } from "./UpdateButton";
import { WindowControls } from "./WindowControls";
import { QuickCaptureButton } from "@/features/quick-capture/ui/QuickCaptureButton";

interface TopBarProps {
  onOpenSettings: (section?: SettingsSectionId) => void;
}

/** Global VSCode-style top bar: menus · command/search · agent · layout toggles · update · window controls.
 *  No brand label: it did nothing, and the user knows which app they are in. */
export const TopBar: React.FC<TopBarProps> = ({ onOpenSettings }) => {
  useTopBarHotkeys();
  const ctx = useMemo(() => ({ openSettings: onOpenSettings }), [onOpenSettings]);
  // Labels are read when the tree is built, so it is built on every render and
  // this bar re-renders when the state a label names changes ("Move primary
  // side bar right/left"). A memo kept the first label for the whole session.
  useUIStore((state) => state.sidebarSide);
  const menus = buildMenus(ctx);
  const [settingsCommands, setSettingsCommands] = useState<PaletteCommand[] | null>(null);
  const paletteOpen = usePalette((state) => state.open);
  const commands = buildCommands(ctx, settingsCommands ?? []);

  // The settings and page registries load WITH the palette, never with the
  // entry chunk. One attempt, one warning per failed module — the other module
  // still loads and the palette keeps working without the failed entries.
  useEffect(() => {
    if (!paletteOpen || settingsCommands !== null) return;
    void Promise.allSettled([
      import("@/features/settings/model/settingsCommands").then((module) => module.settingsPaletteCommands()),
      import("@/features/page-shells/model/layoutPaletteCommands").then((module) => module.layoutPaletteCommands()),
    ]).then(([settings, pages]) => {
      if (settings.status === "rejected") console.warn("[top-bar] settings commands failed to load");
      if (pages.status === "rejected") console.warn("[top-bar] page commands failed to load");
      setSettingsCommands([
        ...(settings.status === "fulfilled" ? settings.value : []),
        ...(pages.status === "fulfilled" ? pages.value : []),
      ]);
    });
  }, [paletteOpen, settingsCommands]);

  return (
    <header
      data-testid="app-topbar"
      className="flex h-[var(--osio-topbar-h)] shrink-0 items-center gap-1.5 bg-transparent px-2"
    >
      <PhoneMenu groups={menus} />
      <div className="hidden md:block">
        <TopBarMenu groups={menus} />
      </div>

      <div className="flex min-w-0 flex-1 justify-center px-3">
        <TopBarSearch commands={commands} />
      </div>

      <AgentButton ctx={ctx} />

      <div className="hidden sm:flex items-center gap-1">
        <SharedSpacePresenceBar />
        <QuickCaptureButton />
        <LayoutToggles />
        <UpdateButton />
      </div>
      <WindowControls />
    </header>
  );
};
