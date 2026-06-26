/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   OsionosAppsSection.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo } from "react";

import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { useInstalledApps } from "@/features/marketplace/model/useInstalledApps";
import { installedTab } from "@/features/marketplace/model/installedAppLauncher";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarSection } from "./SidebarSection";

/** "osionos apps" sidebar section — driven by installed+ACTIVE apps; vanishes when none are. */
export const OsionosAppsSection: React.FC = () => {
  const installedMap = useInstalledApps((s) => s.installed);
  useEffect(() => useInstalledApps.getState().load(), []);
  const apps = useMemo(() => Object.values(installedMap).filter((e) => e.active), [installedMap]);
  if (apps.length === 0) return null;
  return (
    <SidebarSection label="osionos apps">
      {apps.map((app) => (
        <SidebarNavItem
          key={app.identifier}
          icon={<IconValueView value={app.icon ?? "icon:box"} size={16} />}
          label={app.title}
          onClick={() => useWorkspaceLayout.getState().openTab(installedTab(app))}
        />
      ))}
    </SidebarSection>
  );
};
