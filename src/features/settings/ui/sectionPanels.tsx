/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sectionPanels.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One lazy panel per section, listed by the registry's ids. The Record forces a
// type error when a section id is added without its panel; a missing panel can
// then never leave a section that renders nothing. Deep import paths only — a
// barrel would staple every panel onto one chunk and defeat the split.

import React, { lazy, type ComponentType, type LazyExoticComponent } from "react";

import type { StaticPersona } from "@/features/auth";
import type { SettingsSectionId } from "@/features/settings/model/sections";

/** What every panel MAY consume, regardless of what its section actually needs. */
export interface SettingsPanelProps {
  activeUserId: string;
  persona: StaticPersona | null;
  workspaceId?: string;
  workspaceName?: string;
  members: StaticPersona[];
}

export const SETTINGS_PANELS: Record<SettingsSectionId, LazyExoticComponent<ComponentType<SettingsPanelProps>>> = {
  profile: lazy(() => import("@/features/settings/profile/ProfilePanel").then((m) => ({ default: m.ProfilePanel }))),
  preferences: lazy(() => import("@/features/settings/preferences/PreferencesPanel").then((m) => ({ default: m.PreferencesPanel }))),
  accessibility_voice: lazy(() => import("@/features/settings/voice/VoiceSettingsPanel").then((m) => ({ default: m.VoiceSettingsPanel }))),
  notifications: lazy(() => import("@/features/settings/notifications/NotificationsPanel").then((m) => ({ default: m.NotificationsPanel }))),
  connections: lazy(() => import("@/features/settings/connections/ConnectionsPanel").then((m) => ({
    default: (props: SettingsPanelProps) => (
      <m.ConnectionsPanel activeUserId={props.activeUserId} personaEmail={props.persona?.email} />
    ),
  }))),
  contacts: lazy(() => import("@/features/settings/social/LazySocialSettings").then((m) => ({ default: m.LazySocialSettings }))),
  moderation: lazy(() => import("@/features/settings/moderation/ModerationPanel").then((m) => ({ default: m.ModerationPanel }))),
  mail_calendar: lazy(() => import("@/features/settings/mail-calendar/MailCalendarPanel").then((m) => ({
    default: (props: SettingsPanelProps) => (
      <m.MailCalendarPanel activeUserId={props.activeUserId} personaEmail={props.persona?.email} />
    ),
  }))),
  general: lazy(() => import("@/features/settings/general/GeneralPanel").then((m) => ({
    default: (props: SettingsPanelProps) => (
      <m.GeneralPanel
        userId={props.activeUserId}
        workspaceId={props.workspaceId}
        workspaceName={props.workspaceName}
        membersCount={props.members.length}
      />
    ),
  }))),
  people: lazy(() => import("@/features/settings/people/PeoplePanel").then((m) => ({
    default: (props: SettingsPanelProps) => (
      <m.PeoplePanel
        workspaceId={props.workspaceId}
        activeUserId={props.activeUserId}
        personas={props.members}
        membersCount={props.members.length}
      />
    ),
  }))),
  import: lazy(() => import("@/features/settings/import/ImportPanel").then((m) => ({ default: m.ImportPanel }))),
  page_settings: lazy(() => import("@/features/settings/page-settings/PageSettingsPanel").then((m) => ({ default: m.PageSettingsPanel }))),
  shortcuts: lazy(() => import("@/features/automations/ui/LazyAutomationManager").then((m) => ({ default: m.LazyAutomationManager }))),
  ai: lazy(() => import("@/features/settings/ai/AiPanel").then((m) => ({ default: m.AiPanel }))),
  ai_connections: lazy(() => import("@/features/settings/ai/AiConnectionsSection").then((m) => ({ default: m.AiConnectionsSection }))),
  mcp: lazy(() => import("@/features/settings/mcp/McpPanel").then((m) => ({ default: m.McpPanel }))),
  public_pages: lazy(() => import("@/features/settings/public-pages/PublicPagesPanel").then((m) => ({ default: m.PublicPagesPanel }))),
  library: lazy(() => import("@/features/settings/library/LibraryPanel").then((m) => ({ default: m.LibraryPanel }))),
  teamspaces: lazy(() => import("@/features/settings/teamspaces/TeamspacesPanel").then((m) => ({ default: m.TeamspacesPanel }))),
  permissions: lazy(() => import("@/features/settings/permissions/PermissionsPanel").then((m) => ({ default: m.PermissionsPanel }))),
  billing: lazy(() => import("@/features/settings/billing/BillingPanel").then((m) => ({ default: m.BillingPanel }))),
  plans: lazy(() => import("@/features/settings/plans/PlansPanel").then((m) => ({ default: m.PlansPanel }))),
};
