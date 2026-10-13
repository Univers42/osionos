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

import React, { useMemo } from "react";
import type { SettingsTab } from "@osionos/ui/primitives/useSettingsSearchIndex";
import { buildCommands } from "../model/commands";
import { buildMenus } from "../model/menus";
import { useTopBarHotkeys } from "../model/usePalette";
import { SharedSpacePresenceBar } from "@/features/collab/ui/SharedSpacePresenceBar";
import { TopBarMenu } from "./TopBarMenu";
import { TopBarSearch } from "./TopBarSearch";
import { UpdateButton } from "./UpdateButton";
import { WindowControls } from "./WindowControls";
import { QuickCaptureButton } from "@/features/quick-capture/ui/QuickCaptureButton";

interface TopBarProps {
  onOpenSettings: (tab?: SettingsTab) => void;
}

/** Global VSCode-style top bar: menus · command/search · update · window controls.
 *  No brand label: it did nothing, and the user knows which app they are in. */
export const TopBar: React.FC<TopBarProps> = ({ onOpenSettings }) => {
  useTopBarHotkeys();
  const ctx = useMemo(() => ({ openSettings: onOpenSettings }), [onOpenSettings]);
  const menus = useMemo(() => buildMenus(ctx), [ctx]);
  const commands = useMemo(() => buildCommands(ctx), [ctx]);

  return (
    <header
      data-testid="app-topbar"
      className="flex h-[var(--osio-topbar-h)] shrink-0 items-center gap-1.5 border-b border-[var(--osio-topbar-border)] bg-[var(--osio-topbar-bg)] px-2"
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
