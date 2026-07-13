/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ActivityRail.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Settings, CircleUser } from "lucide-react";
import { useUIStore } from "@/shared/config/uiStore";
import { useUserStore } from "@/features/auth";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { mailTab, calendarTab, chatTab, profileTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useChatStore } from "@/features/chat/model/useChatStore";
import { useInstalledApps } from "@/features/marketplace/model/useInstalledApps";
import { installedTab } from "@/features/marketplace/model/installedAppLauncher";
import { RailIcon } from "./RailIcon";
import { RailHomeButton } from "./RailHomeButton";
import { RAIL_TOP_ITEMS, type RailItem } from "../model/railItems";
import { useConnectionNotifications, useIncomingInviteCount } from "@/widgets/notifications/model/useConnectionNotifications";

interface Props {
  onOpenSettings?: () => void;
}

/** The thin (~48px) icon column. Selecting an item opens/toggles its panel;
 *  Mail/Calendar open an in-app iframe tab instead. role=tablist + roving focus.
 *  Memoized — it stays mounted as a crossfade layer; parent preview-flips
 *  re-render it for free otherwise. */
export const ActivityRail = React.memo(function ActivityRail({ onOpenSettings }: Props) {
  const sidebarMode = useUIStore((s) => s.sidebarMode);
  const activePanel = useUIStore((s) => s.activePanel);
  const selectPanel = useUIStore((s) => s.selectPanel);
  const installedMap = useInstalledApps((s) => s.installed);
  const listRef = useRef<HTMLDivElement>(null);

  // Live connection-invitation notifications: hydrate + realtime; badge = incoming count.
  useConnectionNotifications();
  const inviteCount = useIncomingInviteCount();

  useEffect(() => useInstalledApps.getState().load(), []);
  const installedApps = useMemo(
    () => Object.values(installedMap).filter((e) => e.active),
    [installedMap],
  );

  const runItem = useCallback(
    (item: RailItem) => {
      if (item.action.kind === "panel") {
        selectPanel(item.action.panel);
        return;
      }
      if (item.action.kind === "chat") {
        // Open the assistant on a fresh conversation (the user's expectation).
        useChatStore.getState().createConversation();
        useWorkspaceLayout.getState().openTab(chatTab());
        return;
      }
      const tab = item.action.app === "mail" ? mailTab() : calendarTab();
      useWorkspaceLayout.getState().openTab(tab);
    },
    [selectPanel],
  );

  // Roving focus: Up/Down move between rail buttons.
  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('button[role="tab"]') ?? [],
    );
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? current + 1 : current - 1;
    buttons[(next + buttons.length) % buttons.length]?.focus();
  }, []);

  const isPanelItemActive = (item: RailItem) =>
    item.action.kind === "panel" && sidebarMode === "panel" && activePanel === item.action.panel;

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-orientation="vertical"
      aria-label="Activity bar"
      onKeyDown={onKeyDown}
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 bg-[var(--osio-bg-subtle)] py-2"
    >
      <RailHomeButton />
      <div className="my-1 h-px w-6 bg-[var(--osio-border-default)]" />
      {RAIL_TOP_ITEMS.map((item) => (
        <RailIcon
          key={item.id}
          label={item.label}
          Icon={item.Icon}
          active={isPanelItemActive(item)}
          badge={item.action.kind === "panel" && item.action.panel === "notifications" ? inviteCount : undefined}
          onClick={() => runItem(item)}
        />
      ))}

      {installedApps.length > 0 ? <div className="my-1 h-px w-6 bg-[var(--osio-border-default)]" /> : null}

      {installedApps.map((entry) => (
        <RailIcon
          key={entry.identifier}
          label={entry.title}
          iconValue={entry.icon ?? "icon:box"}
          onClick={() => useWorkspaceLayout.getState().openTab(installedTab(entry))}
        />
      ))}

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailIcon
          label="Account"
          Icon={CircleUser}
          onClick={() => {
            const userId = useUserStore.getState().activeUserId;
            if (userId) useWorkspaceLayout.getState().openTab(profileTab(userId));
          }}
        />
        <RailIcon label="Settings" Icon={Settings} onClick={() => onOpenSettings?.()} />
      </div>
    </div>
  );
});
