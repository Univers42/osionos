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
import { buildCommands, type PaletteCommand } from "../model/commands";
import { buildMenus } from "../model/menus";
import { isElectronShell } from "../model/desktop";
import { usePalette, useTopBarHotkeys } from "../model/usePalette";
import { SharedSpacePresenceBar } from "@/features/collab/ui/SharedSpacePresenceBar";
import { TopBarMenu } from "./TopBarMenu";
import { TopBarSearch } from "./TopBarSearch";
import { UpdateButton } from "./UpdateButton";
import { WindowControls } from "./WindowControls";
import { QuickCaptureButton } from "@/features/quick-capture/ui/QuickCaptureButton";

interface TopBarProps {
  onOpenSettings: (section?: SettingsSectionId) => void;
}

/** Global VSCode-style top bar: menus · command/search · update · window controls.
 *  No brand label: it did nothing, and the user knows which app they are in. */
export const TopBar: React.FC<TopBarProps> = ({ onOpenSettings }) => {
  useTopBarHotkeys();
  const ctx = useMemo(() => ({ openSettings: onOpenSettings }), [onOpenSettings]);
  const menus = useMemo(() => buildMenus(ctx), [ctx]);
  const [settingsCommands, setSettingsCommands] = useState<PaletteCommand[] | null>(null);
  const paletteOpen = usePalette((state) => state.open);
  const commands = useMemo(() => buildCommands(ctx, settingsCommands ?? []), [ctx, settingsCommands]);

  // The settings registry is a feature: it loads WITH the palette, never with
  // the entry chunk. One attempt, one warning — a failed load leaves the
  // palette working without the settings entries.
  useEffect(() => {
    if (!paletteOpen || settingsCommands !== null) return;
    void import("@/features/settings/model/settingsCommands")
      .then((module) => setSettingsCommands(module.settingsPaletteCommands()))
      .catch(() => {
        console.warn("[top-bar] settings commands failed to load");
        setSettingsCommands([]);
      });
  }, [paletteOpen, settingsCommands]);

  return (
    <header
      data-testid="app-topbar"
      data-osio-drag={isElectronShell() ? "" : undefined}
      className="flex h-[var(--osio-topbar-h)] shrink-0 items-center gap-1.5 bg-transparent px-2"
    >
      <div className="hidden md:block">
        <TopBarMenu groups={menus} />
      </div>

      <div className="flex min-w-0 flex-1 justify-center px-3">
        <TopBarSearch commands={commands} />
      </div>

      <div className="hidden sm:flex items-center gap-1">
        <SharedSpacePresenceBar />
        <QuickCaptureButton />
        <UpdateButton />
      </div>
      <WindowControls />
    </header>
  );
};
