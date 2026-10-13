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
import { useShallow } from "zustand/react/shallow";
import { useUIStore } from "@/shared/config/uiStore";
import { isAutomationsEnabled } from "@/shared/config/featureFlags";
import { useUserStore } from "@/features/auth";
import { useAutomationStore } from "@/features/automations/model/useAutomationStore";
import { shortcutLabel } from "@/features/automations/model/shortcutLabel";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { mailTab, calendarTab, profileTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useUnreadStore } from "@/store/chat/useUnreadStore";
import { useInstalledApps } from "@/features/marketplace/model/useInstalledApps";
import { installedTab } from "@/features/marketplace/model/installedAppLauncher";
import { RailIcon } from "./RailIcon";
import { RailHomeButton } from "./RailHomeButton";
import { prefetchPanel } from "./panelLoaders";
import { RAIL_GROUPS, type RailItem } from "../model/railItems";
import { useConnectionNotifications, useIncomingInviteCount } from "@/widgets/notifications/model/useConnectionNotifications";

interface Props {
  onOpenSettings?: () => void;
}

const Separator: React.FC = () => <div aria-hidden className="my-1 h-px w-6 shrink-0 bg-[var(--osio-border-default)]" />;

/** The activity rail: one icon per place, grouped Workspace / Conversations /
 *  Apps. Clicking an icon opens its panel (the active one folds the panel); a
 *  pointer resting on an icon starts loading that panel. role=tablist with
 *  roving arrow-key focus. Memoized: it re-renders only on its own state. */
export const ActivityRail = React.memo(function ActivityRail({ onOpenSettings }: Props) {
  const sidebarMode = useUIStore((s) => s.sidebarMode);
  const activePanel = useUIStore((s) => s.activePanel);
  const selectPanel = useUIStore((s) => s.selectPanel);
  const installedMap = useInstalledApps((s) => s.installed);
  const automations = useAutomationStore(useShallow((s) => s.automations()));
  const unread = useUnreadStore((s) => Object.values(s.counts).reduce((sum, count) => sum + (count > 0 ? count : 0), 0));
  const listRef = useRef<HTMLDivElement>(null);
  const showKeys = isAutomationsEnabled();

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
      useWorkspaceLayout.getState().openTab(item.action.app === "mail" ? mailTab() : calendarTab());
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

  const isActive = (item: RailItem) =>
    item.action.kind === "panel" && sidebarMode !== "rail" && activePanel === item.action.panel;
  const badgeOf = (item: RailItem) => {
    if (item.id === "notifications") return inviteCount;
    if (item.id === "conversations") return unread;
    return undefined;
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-orientation="vertical"
      aria-label="Activity bar"
      onKeyDown={onKeyDown}
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-2"
    >
      <RailHomeButton />
      {RAIL_GROUPS.map((group) => (
        <React.Fragment key={group.id}>
          <Separator />
          {group.items.map((item) => {
            const panel = item.action.kind === "panel" ? item.action.panel : null;
            return (
              <RailIcon
                key={item.id}
                label={item.label}
                Icon={item.Icon}
                keys={showKeys && item.commandId ? shortcutLabel(automations, item.commandId) ?? undefined : undefined}
                active={isActive(item)}
                badge={badgeOf(item)}
                onClick={() => runItem(item)}
                onIntent={panel ? () => prefetchPanel(panel) : undefined}
              />
            );
          })}
          {group.id === "apps" ? installedApps.map((entry) => (
            <RailIcon
              key={entry.identifier}
              label={entry.title}
              iconValue={entry.icon ?? "icon:box"}
              onClick={() => useWorkspaceLayout.getState().openTab(installedTab(entry))}
            />
          )) : null}
        </React.Fragment>
      ))}

      <div className="mt-auto flex flex-col items-center gap-1 pt-2">
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
