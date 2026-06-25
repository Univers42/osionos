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
import { PanelLeft } from "lucide-react";
import { useUIStore } from "@/shared/config/uiStore";
import { buildCommands } from "../model/commands";
import { buildMenus } from "../model/menus";
import { useTopBarHotkeys } from "../model/usePalette";
import { TopBarMenu } from "./TopBarMenu";
import { TopBarSearch } from "./TopBarSearch";
import { UpdateButton } from "./UpdateButton";
import { WindowControls } from "./WindowControls";
import { HomeVariantControl } from "@/widgets/home-variants/ui/HomeVariantControl";

interface TopBarProps {
  onOpenSettings: () => void;
}

/** Global VSCode-style top bar: logo · menus · command/search · update · window controls. */
export const TopBar: React.FC<TopBarProps> = ({ onOpenSettings }) => {
  useTopBarHotkeys();
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const ctx = useMemo(() => ({ openSettings: onOpenSettings }), [onOpenSettings]);
  const menus = useMemo(() => buildMenus(ctx), [ctx]);
  const commands = useMemo(() => buildCommands(ctx), [ctx]);

  return (
    <header
      data-testid="app-topbar"
      className="flex h-[var(--osio-topbar-h)] shrink-0 items-center gap-1.5 border-b border-[var(--osio-topbar-border)] bg-[var(--osio-topbar-bg)] px-2"
    >
      <button
        type="button"
        aria-label="Toggle sidebar"
        onClick={toggleSidebar}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
      >
        <PanelLeft size={16} aria-hidden />
      </button>

      <span className="flex shrink-0 select-none items-center gap-1.5 pl-1 pr-1.5" aria-label="osionos">
        <span aria-hidden className="h-4 w-4 rounded-[5px] bg-[var(--osio-accent)]" />
        <span className="text-sm font-semibold tracking-tight text-[var(--osio-fg-default)]">osionos</span>
      </span>

      <TopBarMenu groups={menus} />

      <HomeVariantControl />

      <div className="flex min-w-0 flex-1 justify-center px-3">
        <TopBarSearch commands={commands} />
      </div>

      <UpdateButton />
      <WindowControls />
    </header>
  );
};
