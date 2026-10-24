/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sections.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The ONE list of settings sections. Navigation, search, the panel loader and
// the view header all read this registry — nothing else keeps its own copy.
// The ids and labels are the modal's, verbatim: saved links, menus.ts callers
// and tests keep pointing at the same things.

import {
  Bell,
  Bot,
  CalendarDays,
  CreditCard,
  FileText,
  Globe,
  Import,
  Keyboard,
  KeyRound,
  LayoutGrid,
  Mail,
  Palette,
  Plug,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  User,
  UserPlus,
  Users,
  Volume2,
  UserX,
} from "lucide-react";

import { isAccountDeleteEnabled } from "@/shared/config/featureFlags";

import type { SettingsAnchor, SettingsSection } from "./sectionTypes";

export { SETTINGS_GROUPS } from "./sectionTypes";
export type { SettingsAnchor, SettingsGroup, SettingsGroupId, SettingsSection, SettingsSectionId } from "./sectionTypes";

const DANGER_ANCHOR: SettingsAnchor = { id: "danger", label: "Delete account", keywords: ["delete", "close", "remove account"] };

const PROFILE_ANCHORS: readonly SettingsAnchor[] = [
  { id: "public-profile", label: "Public profile", keywords: ["name", "pronouns", "bio", "website", "links", "company", "location", "orcid", "patreon", "avatar", "photo"], description: "Edit your public profile." },
  { id: "account-security", label: "Account security", keywords: ["email", "password", "verification", "passkey", "two step"] },
  { id: "sessions", label: "Sessions", keywords: ["sessions", "sign out", "logout", "device", "web", "desktop", "mobile"] },
  { id: "user-id", label: "User ID", keywords: ["copy", "id", "identifier"] },
];

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: "profile", group: "account", label: "Profile", title: "Profile",
    subtitle: "Manage your profile, login information, and sessions", icon: User,
    // A getter so the palette and search read the flag when they run: a hidden row is never offered.
    get anchors(): readonly SettingsAnchor[] {
      return [...PROFILE_ANCHORS, ...(isAccountDeleteEnabled() ? [DANGER_ANCHOR] : [])];
    },
  },
  {
    id: "preferences", group: "account", label: "Preferences", title: "Preferences",
    subtitle: "Choose how you want osionos to look and behave", icon: SlidersHorizontal,
    anchors: [
      { id: "appearance", label: "Theme", keywords: ["appearance", "theme", "dark", "light"] },
      { id: "input-options", label: "Input options", keywords: ["enter", "newline", "send"] },
      { id: "accessibility", label: "Accessibility", keywords: ["motion", "animation", "underline", "links", "hovercard", "gif", "paste", "url"] },
      { id: "language-time", label: "Language and time", keywords: ["language", "number", "date", "timezone", "week"] },
      { id: "desktop-app", label: "Desktop app", keywords: ["startup", "open", "last visited"] },
      { id: "privacy", label: "Privacy", keywords: ["cookies", "view history", "discoverability"] },
    ],
  },
  {
    id: "accessibility_voice", group: "account", label: "Accessibility & voice", title: "Accessibility & voice",
    subtitle: "Dictate what you say, and hear an answer read aloud — on your device by default", icon: Volume2,
    anchors: [{ id: "accessibility-voice", label: "Accessibility & voice", keywords: ["voice", "dictation", "speech", "read aloud", "microphone", "text to speech"] }],
  },
  {
    id: "notifications", group: "account", label: "Notifications", title: "Notifications",
    subtitle: "Decide when and how you want to be notified", icon: Bell,
    anchors: [
      { id: "in-app-notifications", label: "In-app notifications", keywords: ["meeting", "activity", "transcription"] },
      { id: "slack-notifications", label: "Slack notifications", keywords: ["slack", "notifications"] },
      { id: "discord-notifications", label: "Discord notifications", keywords: ["discord", "notifications"] },
      { id: "email-notifications", label: "Email notifications", keywords: ["email", "digest", "announcements", "updates"] },
    ],
  },
  {
    id: "connections", group: "account", label: "Connections", title: "Connections",
    subtitle: "Manage and explore connections", icon: LayoutGrid,
    anchors: [
      { id: "my-connections", label: "My connections", keywords: ["github", "slack", "chartbase", "whimsical"] },
      { id: "discover-connections", label: "Discover connections", keywords: ["connectors", "gallery", "install", "mcp"] },
    ],
  },
  {
    id: "contacts", group: "account", label: "Contacts", title: "Contacts",
    subtitle: "Manage your connections and the reports you filed", icon: UserPlus,
    anchors: [
      { id: "presence-status", label: "Presence and status", keywords: ["presence", "status", "away", "busy", "do not disturb", "invisible", "online"] },
      { id: "connections", label: "Your connections", keywords: ["contacts", "friends", "requests", "remove", "people"] },
      { id: "reports", label: "Reports you filed", keywords: ["report", "abuse", "filed", "flag"] },
    ],
  },
  {
    id: "moderation", group: "account", label: "Moderation", title: "Moderation",
    subtitle: "Blocked people, and who may reach you", icon: UserX,
    anchors: [
      { id: "blocked-users", label: "Blocked users",
        keywords: ["block", "blocked", "unblock", "hide", "people", "mute"] },
      { id: "interaction-limits", label: "Interaction limits",
        keywords: ["message", "connect", "comment", "limit", "restrict", "who can", "duration", "mute", "reach"] },
    ],
  },
  {
    id: "mail_calendar", group: "account", label: "Mail & Calendar", title: "Mail & Calendar",
    subtitle: "Manage emails and calendars connected to your osionos account", icon: Mail,
    anchors: [
      { id: "connected-emails", label: "Connected emails", keywords: ["mail", "email", "address"] },
      { id: "connected-calendars", label: "Connected calendars", keywords: ["calendar", "holidays", "events"] },
    ],
  },
  {
    id: "general", group: "workspace", label: "General", title: "General",
    subtitle: "Manage your workspace name, domains, and more", icon: Settings,
    anchors: [
      { id: "workspace-settings", label: "Workspace settings", keywords: ["workspace", "name", "icon", "landing page"] },
      { id: "sidebar", label: "Sidebar", keywords: ["sidebar", "apps", "calendar", "mail"] },
      { id: "export", label: "Export", keywords: ["export", "members", "workspace content"] },
      { id: "analytics", label: "Analytics", keywords: ["page views", "analytics", "views"] },
      { id: "danger-zone", label: "Delete workspace", keywords: ["danger", "delete", "workspace"] },
      { id: "workspace-id", label: "Workspace ID", keywords: ["copy", "id", "identifier"] },
    ],
  },
  {
    id: "people", group: "workspace", label: "People", title: "People",
    subtitle: "Manage people in your workspace and their roles", icon: Users,
    anchors: [{ id: "people", label: "People", keywords: ["members", "guests", "groups", "contacts", "invite"] }],
  },
  {
    id: "import", group: "workspace", label: "Import", title: "Import",
    subtitle: "Import data from other apps and files into osionos", icon: Import,
    anchors: [
      { id: "import-content", label: "Import content", keywords: ["import", "upload", "csv", "pdf", "markdown", "html", "word"] },
      { id: "third-party-imports", label: "Third-party imports", keywords: ["asana", "confluence", "trello", "jira", "google docs"] },
    ],
  },
  {
    id: "page_settings", group: "workspace", label: "Page settings", title: "Page settings",
    subtitle: "Settings for the page you have open", icon: FileText,
    anchors: [
      { id: "style", label: "Page style", keywords: ["font", "default", "serif", "mono"] },
      { id: "actions", label: "Page actions", keywords: ["copy", "duplicate", "trash", "present", "translate", "export"] },
      { id: "page-switches", label: "Page switches", keywords: ["small text", "full width", "lock page"] },
      { id: "history-connections", label: "History and connections", keywords: ["analytics", "version", "comments", "notify"] },
    ],
  },
  {
    id: "shortcuts", group: "workspace", label: "Keyboard shortcuts", title: "Keyboard shortcuts",
    subtitle: "Rebind, add, toggle, and export keyboard shortcuts — each is an editable automation",
    icon: Keyboard,
    anchors: [{ id: "keyboard-shortcuts", label: "Keyboard shortcuts", keywords: ["shortcut", "shortcuts", "keyboard", "keybinding", "hotkey", "automation", "combo", "vscode"], description: "Rebind, add, and export keyboard shortcuts." }],
  },
  {
    id: "ai", group: "features", label: "osionos AI", title: "osionos AI",
    subtitle: "Search everywhere, automate meeting notes and configure AI features", icon: Sparkles,
    anchors: [{ id: "osionos-ai", label: "osionos AI", keywords: ["ai", "agents", "meeting notes", "summaries", "search"] }],
  },
  {
    id: "ai_connections", group: "features", label: "AI connections", title: "AI connections",
    subtitle: "Bring your own model access — your keys stay on the server", icon: Plug,
    anchors: [
      { id: "ai-connections", label: "AI connections", keywords: ["openrouter", "model", "provider", "api key", "byok", "connect"] },
      { id: "ai-access-tokens", label: "AI access tokens", keywords: ["token", "access token", "pat", "api", "assistant"] },
    ],
  },
  {
    id: "mcp", group: "features", label: "osionos MCP", title: "osionos MCP",
    subtitle: "Connect osionos to your AI tools to summarize, search, and move faster", icon: Bot,
    anchors: [{ id: "osionos-mcp", label: "osionos MCP", keywords: ["mcp", "tools", "developer", "ai clients"] }],
  },
  {
    id: "developer", group: "features", label: "Developer", title: "Developer",
    subtitle: "Personal access tokens, and the apps that act for you", icon: Terminal,
    anchors: [
      { id: "personal-access-tokens", label: "Personal access tokens", keywords: ["token", "pat", "api key", "secret", "credential", "scope", "developer"] },
      { id: "authorized-apps", label: "Authorized apps", keywords: ["authorized", "apps", "mcp", "claude", "token", "access", "revoke"] },
      { id: "ssh-gpg-keys", label: "SSH and GPG keys", keywords: ["ssh", "gpg", "key", "fingerprint", "git", "signing", "deploy"] },
    ],
  },
  {
    id: "public_pages", group: "features", label: "Published pages", title: "Published pages",
    subtitle: "The pages you published to the web", icon: Globe,
    anchors: [{ id: "public-pages", label: "Published pages", keywords: ["publish", "published", "web", "public", "live", "republish", "unpublish", "snapshot", "link"] }],
  },
  {
    id: "library", group: "features", label: "Emoji & Library", title: "Emoji & Library",
    subtitle: "Emoji and images you uploaded", icon: Palette,
    anchors: [{ id: "library", label: "Emoji and library", keywords: ["emoji", "assets", "photos", "uploads", "library"] }],
  },
  {
    id: "teamspaces", group: "access", label: "Teamspaces", title: "Teamspaces",
    subtitle: "Manage teamspaces in this workspace", icon: Shield,
    anchors: [{ id: "teamspaces", label: "Teamspaces", keywords: ["teamspace", "owner", "access", "security"] }],
  },
  {
    id: "permissions", group: "access", label: "Permissions", title: "Permissions",
    subtitle: "Role × resource access matrix, field masks, and live decision testing", icon: KeyRound,
    anchors: [
      { id: "access-matrix", label: "Access matrix", keywords: ["permissions", "abac", "roles", "policies", "chmod", "matrix"], description: "Role × resource permission matrix." },
      { id: "policy-conditions", label: "Conditions and field masks", keywords: ["mask", "redact", "hide", "clearance", "department", "conditions"] },
      { id: "view-as", label: "View as", keywords: ["view as", "simulate", "decide", "allow", "deny"] },
    ],
  },
  {
    id: "billing", group: "access", label: "Billing", title: "Billing",
    subtitle: "Manage billing information and view your upcoming invoice", icon: CreditCard,
    anchors: [{ id: "billing", label: "Billing", keywords: ["plan", "payment", "invoice", "vat", "gst"] }],
  },
  {
    id: "plans", group: "access", label: "Explore plans", title: "Explore plans",
    subtitle: "Compare all osionos plans", icon: CalendarDays,
    anchors: [{ id: "plans", label: "Explore plans", keywords: ["free", "plus", "business", "enterprise", "upgrade"] }],
  },
];

/** Unknown ids find nothing — callers may render a first-registry fallback. */
export function findSection(id: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((section) => section.id === id);
}

export interface SettingsSearchHit {
  section: SettingsSection;
  anchor: SettingsAnchor;
}

/** Registry order — an empty query answers with the same list the nav shows. */
const allHits = (): readonly SettingsSearchHit[] =>
  SETTINGS_SECTIONS.flatMap((section) => section.anchors.map((anchor) => ({ section, anchor })));

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function searchSettings(query: string): SettingsSearchHit[] {
  const normalized = normalize(query);
  if (!normalized) return [...allHits()];
  const terms = normalized.split(/\s+/).filter(Boolean);

  return allHits().map((hit) => {
      const haystack = normalize([
        hit.anchor.label,
        hit.anchor.description ?? "",
        hit.section.id,
        hit.anchor.id,
        ...hit.anchor.keywords,
      ].join(" "));
      const score = terms.reduce((total, term) => {
        if (normalize(hit.anchor.label).startsWith(term)) return total + 4;
        if (haystack.includes(term)) return total + 1;
        return total;
      }, 0);
      return { hit, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.hit.anchor.label.localeCompare(right.hit.anchor.label))
    .map(({ hit }) => hit);
}
