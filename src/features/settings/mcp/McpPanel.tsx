/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   McpPanel.tsx                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from "react";
import { Bot, Search } from "lucide-react";

import { useUserStore } from "@/features/auth";
import { MiniTabs, Toggle } from "@/shared/ui";
import type { McpSettings } from "@/store/settings";
import { MCP_TOOL_OPTIONS, canConnectApp, useMcpSettingsStore } from "@/store/settings";
import { AppIcon, MCP_APP_CATEGORIES, MCP_APP_CATALOG, type McpApp } from "./mcpCatalog";
import { McpManageTab } from "./McpManageTab";

type TabId = "discover" | "manage";
interface Member { id: string; name: string }

function disabledReason(settings: McpSettings): string {
  if (!settings.connected) return "Turn on osionos MCP to connect apps";
  if (settings.restrictPolicy === "none") return "Your workspace admin turned off app connections";
  if (settings.restrictPolicy === "approved") return "Not approved by your workspace admin";
  return "";
}

const AppCard: React.FC<{ app: McpApp; connected: boolean; canConnect: boolean; reason: string; onToggle: () => void }> = ({ app, connected, canConnect, reason, onToggle }) => (
  <div className="flex items-start gap-3 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3">
    <AppIcon app={app} size={36} />
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-[var(--osio-fg-default)]">{app.name}</div>
      <p className="mt-0.5 line-clamp-2 text-xs leading-[16px] text-[var(--osio-fg-muted)]">{app.description}</p>
    </div>
    <button
      type="button"
      data-testid={`mcp-app-toggle-${app.id}`}
      onClick={onToggle}
      disabled={!connected && !canConnect}
      title={!connected && !canConnect ? reason : undefined}
      className={
        connected
          ? "shrink-0 rounded-md border border-[var(--osio-border-default)] px-3 py-1 text-sm font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
          : "shrink-0 rounded-md bg-[var(--osio-accent)] px-3 py-1 text-sm font-medium text-[var(--osio-accent-fg)] hover:bg-[var(--osio-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--osio-bg-subtle)] disabled:text-[var(--osio-fg-subtle)]"
      }
    >
      {connected ? "Connected" : "Connect"}
    </button>
  </div>
);

const DiscoverGrid: React.FC<{ workspaceId: string; settings: McpSettings; member: Member }> = ({ workspaceId, settings, member }) => {
  const connectApp = useMcpSettingsStore((state) => state.connectApp);
  const disconnectApp = useMcpSettingsStore((state) => state.disconnectApp);
  const [query, setQuery] = useState("");

  const isMine = (appId: string) => settings.connections.some((c) => c.appId === appId && c.memberId === member.id);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MCP_APP_CATALOG.filter((app) => !q || app.name.toLowerCase().includes(q) || app.description.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5">
        <Search size={15} className="text-[var(--osio-fg-subtle)]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search AI apps"
          aria-label="Search AI apps"
          className="h-9 w-full bg-transparent text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none"
        />
      </div>
      {MCP_APP_CATEGORIES.map((category) => {
        const apps = matches.filter((app) => app.category === category);
        if (apps.length === 0) return null;
        return (
          <section key={category} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">{category}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {apps.map((app) => {
                const connected = isMine(app.id);
                return (
                  <AppCard
                    key={app.id}
                    app={app}
                    connected={connected}
                    canConnect={canConnectApp(settings, app.id)}
                    reason={disabledReason(settings)}
                    onToggle={() => (connected ? disconnectApp(workspaceId, app.id, member.id) : connectApp(workspaceId, app.id, member))}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
      {matches.length === 0 && <p className="py-6 text-center text-sm text-[var(--osio-fg-muted)]">No AI apps match “{query}”.</p>}
    </div>
  );
};

const Capabilities: React.FC<{ workspaceId: string; settings: McpSettings }> = ({ workspaceId, settings }) => {
  const update = useMcpSettingsStore((state) => state.update);
  const toggleTool = useMcpSettingsStore((state) => state.toggleTool);
  return (
    <section className="space-y-3 border-t border-[var(--osio-border-default)] pt-5">
      <div>
        <div className="text-sm font-medium text-[var(--osio-fg-default)]">osionos MCP capabilities</div>
        <div className="mt-1 text-sm text-[var(--osio-fg-muted)]">What connected AI apps are allowed to do in this workspace.</div>
      </div>
      <div className="grid gap-1 rounded-lg border border-[var(--osio-border-default)] p-2 sm:grid-cols-2">
        {MCP_TOOL_OPTIONS.map((tool) => (
          <label key={tool.value} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--osio-bg-hover)]">
            <span className="text-sm text-[var(--osio-fg-default)]">{tool.label}</span>
            <Toggle size="sm" checked={settings.allowedTools.includes(tool.value)} onChange={() => toggleTool(workspaceId, tool.value)} label={tool.label} />
          </label>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2 py-1">
        <span>
          <span className="block text-sm font-medium text-[var(--osio-fg-default)]">Developer mode</span>
          <span className="block text-sm text-[var(--osio-fg-muted)]">Expose MCP debugging details and local command setup.</span>
        </span>
        <Toggle checked={settings.developerMode} onChange={(checked) => update(workspaceId, { developerMode: checked })} label="Developer mode" />
      </label>
      {settings.developerMode && (
        <pre className="overflow-auto rounded-md bg-[var(--osio-bg-subtle)] p-3 text-xs text-[var(--osio-fg-muted)]">claude mcp add osionos --url {`${window.location.origin}`}/mcp</pre>
      )}
    </section>
  );
};

export const McpPanel: React.FC = () => {
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? "local-workspace");
  const persona = useUserStore((state) => state.activePersona());
  const activeUserId = useUserStore((state) => state.activeUserId);
  const settings = useMcpSettingsStore((state) => state.getData(workspaceId));
  const update = useMcpSettingsStore((state) => state.update);
  const [tab, setTab] = useState<TabId>("discover");

  const member: Member = { id: activeUserId ?? "local-user", name: persona?.name ?? persona?.email ?? "You" };
  const connectedCount = useMemo(() => new Set(settings.connections.map((c) => c.appId)).size, [settings.connections]);

  return (
    <section className="space-y-5" data-settings-anchor="osionos-mcp" data-testid="mcp-panel">
      <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-subtle)] text-[var(--osio-accent)]"><Bot size={16} /></span>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-medium text-[var(--osio-fg-default)]">Connect osionos to your AI tools</h4>
            <p className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">Summarize, search, and move faster with MCP-compatible clients like ChatGPT, Claude, Cursor and more.</p>
          </div>
          <Toggle checked={settings.connected} onChange={(checked) => update(workspaceId, { connected: checked })} label="Enable osionos MCP" />
        </div>
      </div>

      <MiniTabs<TabId>
        value={tab}
        onChange={setTab}
        options={[
          { value: "discover", label: "Discover" },
          { value: "manage", label: "Manage", count: connectedCount },
        ]}
      />

      {tab === "discover" ? (
        <DiscoverGrid workspaceId={workspaceId} settings={settings} member={member} />
      ) : (
        <div className="space-y-6">
          <McpManageTab workspaceId={workspaceId} settings={settings} />
          <Capabilities workspaceId={workspaceId} settings={settings} />
        </div>
      )}
    </section>
  );
};
