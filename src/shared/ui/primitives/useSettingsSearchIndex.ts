export type SettingsTab =
  | "profile"
  | "preferences"
  | "notifications"
  | "connections"
  | "mail_calendar"
  | "general"
  | "people"
  | "import"
  | "page_settings"
  | "ai"
  | "mcp"
  | "public_pages"
  | "library"
  | "teamspaces"
  | "billing"
  | "plans";

export interface SettingsSearchEntry {
  tab: SettingsTab;
  anchor: string;
  label: string;
  keywords: string[];
  description?: string;
}

export const SETTINGS_SEARCH_ENTRIES: SettingsSearchEntry[] = [
  { tab: "profile", anchor: "account", label: "Preferred name", keywords: ["profile", "name", "avatar", "face"], description: "Edit your account identity." },
  { tab: "profile", anchor: "account-security", label: "Account security", keywords: ["email", "password", "verification", "passkey", "two step"] },
  { tab: "profile", anchor: "support", label: "Support access", keywords: ["support", "access", "delete account"] },
  { tab: "profile", anchor: "devices", label: "Devices", keywords: ["sessions", "logout", "device"] },
  { tab: "profile", anchor: "user-id", label: "User ID", keywords: ["copy", "id", "identifier"] },
  { tab: "preferences", anchor: "appearance", label: "Theme", keywords: ["appearance", "theme", "dark", "light"] },
  { tab: "preferences", anchor: "input-options", label: "Input options", keywords: ["enter", "newline", "send"] },
  { tab: "preferences", anchor: "language-time", label: "Language and time", keywords: ["language", "number", "date", "timezone", "week"] },
  { tab: "preferences", anchor: "desktop-app", label: "Desktop app", keywords: ["startup", "open", "last visited"] },
  { tab: "preferences", anchor: "privacy", label: "Privacy", keywords: ["cookies", "view history", "discoverability"] },
  { tab: "notifications", anchor: "in-app-notifications", label: "In-app notifications", keywords: ["meeting", "activity", "transcription"] },
  { tab: "notifications", anchor: "slack-notifications", label: "Slack notifications", keywords: ["slack", "notifications"] },
  { tab: "notifications", anchor: "discord-notifications", label: "Discord notifications", keywords: ["discord", "notifications"] },
  { tab: "notifications", anchor: "email-notifications", label: "Email notifications", keywords: ["email", "digest", "announcements", "updates"] },
  { tab: "connections", anchor: "my-connections", label: "My connections", keywords: ["github", "slack", "chartbase", "whimsical"] },
  { tab: "connections", anchor: "discover-connections", label: "Discover connections", keywords: ["connectors", "gallery", "install", "mcp"] },
  { tab: "mail_calendar", anchor: "connected-emails", label: "Connected emails", keywords: ["mail", "email", "address"] },
  { tab: "mail_calendar", anchor: "connected-calendars", label: "Connected calendars", keywords: ["calendar", "holidays", "events"] },
  { tab: "general", anchor: "workspace-settings", label: "Workspace settings", keywords: ["workspace", "name", "icon", "landing page"] },
  { tab: "general", anchor: "sidebar", label: "Sidebar", keywords: ["sidebar", "apps", "calendar", "mail"] },
  { tab: "general", anchor: "export", label: "Export", keywords: ["export", "members", "workspace content"] },
  { tab: "general", anchor: "analytics", label: "Analytics", keywords: ["page views", "analytics", "views"] },
  { tab: "general", anchor: "danger-zone", label: "Delete workspace", keywords: ["danger", "delete", "workspace"] },
  { tab: "general", anchor: "workspace-id", label: "Workspace ID", keywords: ["copy", "id", "identifier"] },
  { tab: "people", anchor: "people", label: "People", keywords: ["members", "guests", "groups", "contacts", "invite"] },
  { tab: "import", anchor: "import-content", label: "Import content", keywords: ["import", "upload", "csv", "pdf", "markdown", "html", "word"] },
  { tab: "import", anchor: "third-party-imports", label: "Third-party imports", keywords: ["asana", "confluence", "trello", "jira", "google docs"] },
  { tab: "page_settings", anchor: "style", label: "Page style", keywords: ["font", "default", "serif", "mono"] },
  { tab: "page_settings", anchor: "actions", label: "Page actions", keywords: ["copy", "duplicate", "trash", "present", "translate", "export"] },
  { tab: "page_settings", anchor: "page-switches", label: "Page switches", keywords: ["small text", "full width", "lock page"] },
  { tab: "page_settings", anchor: "history-connections", label: "History and connections", keywords: ["analytics", "version", "comments", "notify"] },
  { tab: "ai", anchor: "osionos-ai", label: "osionos AI", keywords: ["ai", "agents", "meeting notes", "summaries", "search"] },
  { tab: "mcp", anchor: "osionos-mcp", label: "osionos MCP", keywords: ["mcp", "tools", "developer", "ai clients"] },
  { tab: "public_pages", anchor: "public-pages", label: "Public pages", keywords: ["sites", "forms", "domains", "public", "live"] },
  { tab: "library", anchor: "library", label: "Emoji and library", keywords: ["emoji", "assets", "photos", "uploads", "library"] },
  { tab: "teamspaces", anchor: "teamspaces", label: "Teamspaces", keywords: ["teamspace", "owner", "access", "security"] },
  { tab: "billing", anchor: "billing", label: "Billing", keywords: ["plan", "payment", "invoice", "vat", "gst"] },
  { tab: "plans", anchor: "plans", label: "Explore plans", keywords: ["free", "plus", "business", "enterprise", "upgrade"] },
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function searchSettings(query: string): SettingsSearchEntry[] {
  const normalized = normalize(query);
  if (!normalized) return SETTINGS_SEARCH_ENTRIES;
  const terms = normalized.split(/\s+/).filter(Boolean);

  return SETTINGS_SEARCH_ENTRIES
    .map((entry) => {
      const haystack = normalize([
        entry.label,
        entry.description ?? "",
        entry.tab,
        entry.anchor,
        ...entry.keywords,
      ].join(" "));
      const score = terms.reduce((total, term) => {
        if (normalize(entry.label).startsWith(term)) return total + 4;
        if (haystack.includes(term)) return total + 1;
        return total;
      }, 0);
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label))
    .map(({ entry }) => entry);
}

export function useSettingsSearchIndex(query = "") {
  return searchSettings(query);
}
