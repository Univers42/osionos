/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sectionTypes.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The shapes of the settings registry (sections.ts), apart so the registry itself
// stays one list under the 300-line rule.

import type { LucideIcon } from "lucide-react";

export type SettingsSectionId =
  | "profile"
  | "preferences"
  | "accessibility_voice"
  | "notifications"
  | "connections"
  | "contacts"
  | "moderation"
  | "mail_calendar"
  | "general"
  | "people"
  | "import"
  | "page_settings"
  | "shortcuts"
  | "ai"
  | "ai_connections"
  | "mcp"
  | "public_pages"
  | "library"
  | "teamspaces"
  | "permissions"
  | "billing"
  | "plans";

export type SettingsGroupId = "account" | "workspace" | "features" | "access";

export interface SettingsGroup {
  id: SettingsGroupId;
  label: string;
}

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  { id: "account", label: "Account" },
  { id: "workspace", label: "Workspace" },
  { id: "features", label: "Features" },
  { id: "access", label: "Access & billing" },
];

/** One scroll target inside a panel (`[data-settings-anchor]`); the search index
 *  of the old modal, moved here so the registry is the only place it lives. */
export interface SettingsAnchor {
  id: string;
  label: string;
  keywords: string[];
  description?: string;
}

export interface SettingsSection {
  id: SettingsSectionId;
  group: SettingsGroupId;
  /** Nav label (the profile entry renders the persona name instead). */
  label: string;
  /** Panel heading. */
  title: string;
  /** One-line summary under the heading. */
  subtitle: string;
  icon: LucideIcon;
  anchors: readonly SettingsAnchor[];
}
