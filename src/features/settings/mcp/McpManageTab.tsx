/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   McpManageTab.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Modal, Toggle } from "@/shared/ui";
import type { McpRestrictPolicy, McpSettings } from "@/store/settings";
import { useMcpSettingsStore } from "@/store/settings";
import { AppIcon, MCP_APP_CATALOG, findMcpApp } from "./mcpCatalog";

const POLICY_OPTIONS: ReadonlyArray<{ value: McpRestrictPolicy; label: string }> = [
  { value: "all", label: "Any app" },
  { value: "approved", label: "Only approved apps" },
  { value: "none", label: "No apps" },
];

interface McpManageTabProps {
  workspaceId: string;
  settings: McpSettings;
}

/** A connected app + who connected it, with an admin disconnect-for-everyone action. */
const ConnectedAppRow: React.FC<{ appId: string; members: string[]; onDisconnect: () => void }> = ({ appId, members, onDisconnect }) => {
  const app = findMcpApp(appId);
  if (!app) return null;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <AppIcon app={app} size={28} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--osio-fg-default)]">{app.name}</div>
        <div className="truncate text-xs text-[var(--osio-fg-muted)]">
          Connected by {members.length === 1 ? members[0] : `${members.length} members`}
        </div>
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        className="rounded-md px-2.5 py-1 text-sm font-medium text-[var(--osio-danger)] hover:bg-[var(--osio-danger)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
      >
        Disconnect
      </button>
    </div>
  );
};

const DisconnectAllConfirm: React.FC<{ count: number; onCancel: () => void; onConfirm: () => void }> = ({ count, onCancel, onConfirm }) => (
  <Modal open onClose={onCancel} title="Disconnect all users from osionos MCP" size="sm">
    <div data-testid="mcp-disconnect-all-confirm" className="space-y-4 text-sm text-[var(--osio-fg-muted)]">
      <p>
        This removes {count} external app {count === 1 ? "connection" : "connections"} for every member. They will
        need to reconnect to use osionos through their AI tools. This cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]">
          Cancel
        </button>
        <button
          type="button"
          data-testid="mcp-disconnect-all-confirm-btn"
          onClick={onConfirm}
          className="rounded-md bg-[var(--osio-danger)] px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Disconnect all users
        </button>
      </div>
    </div>
  </Modal>
);

export const McpManageTab: React.FC<McpManageTabProps> = ({ workspaceId, settings }) => {
  const setRestrictPolicy = useMcpSettingsStore((state) => state.setRestrictPolicy);
  const toggleApprovedApp = useMcpSettingsStore((state) => state.toggleApprovedApp);
  const disconnectApp = useMcpSettingsStore((state) => state.disconnectApp);
  const disconnectAll = useMcpSettingsStore((state) => state.disconnectAll);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Group active connections by app, preserving catalog order.
  const connectedApps = useMemo(() => {
    const byApp = new Map<string, string[]>();
    for (const c of settings.connections) {
      const list = byApp.get(c.appId) ?? [];
      list.push(c.memberName);
      byApp.set(c.appId, list);
    }
    return MCP_APP_CATALOG.filter((app) => byApp.has(app.id)).map((app) => ({ appId: app.id, members: byApp.get(app.id) ?? [] }));
  }, [settings.connections]);

  return (
    <div className="space-y-6">
      {/* Restrict which apps members can connect */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-sm font-medium text-[var(--osio-fg-default)]">Restrict AI apps members can connect</div>
            <div className="mt-1 text-sm text-[var(--osio-fg-muted)]">Control which external AI apps members can connect through osionos MCP.</div>
          </div>
          <div className="relative flex items-center">
            {/* Native select — a custom popup dropdown self-closes inside the focus-trapped Settings modal. */}
            <select
              aria-label="Restrict AI apps members can connect"
              data-testid="mcp-restrict-policy"
              value={settings.restrictPolicy}
              onChange={(event) => setRestrictPolicy(workspaceId, event.target.value as McpRestrictPolicy)}
              className="cursor-pointer appearance-none rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] py-1.5 pl-3 pr-8 text-sm font-medium text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
            >
              {POLICY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2 text-[var(--osio-fg-subtle)]" />
          </div>
        </div>

        {settings.restrictPolicy === "approved" && (
          <div data-testid="mcp-approved-list" className="mt-2 grid gap-1 rounded-lg border border-[var(--osio-border-default)] p-2 sm:grid-cols-2">
            {MCP_APP_CATALOG.map((app) => (
              <label key={app.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-[var(--osio-bg-hover)]">
                <AppIcon app={app} size={22} />
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--osio-fg-default)]">{app.name}</span>
                <Toggle
                  size="sm"
                  checked={settings.approvedApps.includes(app.id)}
                  onChange={() => toggleApprovedApp(workspaceId, app.id)}
                  label={`Approve ${app.name}`}
                />
              </label>
            ))}
          </div>
        )}
      </section>

      {/* View & manage all external AI apps */}
      <section className="space-y-1">
        <div className="text-sm font-medium text-[var(--osio-fg-default)]">
          View &amp; manage all external AI apps
        </div>
        <div className="text-sm text-[var(--osio-fg-muted)]">
          <span data-testid="mcp-connected-count">{connectedApps.length}</span> connected
        </div>
        <div className="mt-2 divide-y divide-[var(--osio-border-default)] rounded-lg border border-[var(--osio-border-default)] px-3">
          {connectedApps.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--osio-fg-muted)]">No external AI apps are connected yet.</p>
          ) : (
            connectedApps.map((entry) => (
              <ConnectedAppRow key={entry.appId} appId={entry.appId} members={entry.members} onDisconnect={() => disconnectApp(workspaceId, entry.appId)} />
            ))
          )}
        </div>
      </section>

      {/* Kill switch */}
      <section className="rounded-lg border border-[var(--osio-danger)]/30 bg-[var(--osio-danger)]/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-sm font-medium text-[var(--osio-fg-default)]">Disconnect from osionos MCP</div>
            <div className="mt-1 text-sm text-[var(--osio-fg-muted)]">Immediately revoke every member connection to external AI apps.</div>
          </div>
          <button
            type="button"
            data-testid="mcp-disconnect-all"
            disabled={settings.connections.length === 0}
            onClick={() => setConfirmOpen(true)}
            className="rounded-md bg-[var(--osio-danger)] px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Disconnect all users
          </button>
        </div>
      </section>

      {confirmOpen && (
        <DisconnectAllConfirm
          count={settings.connections.length}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => { disconnectAll(workspaceId); setConfirmOpen(false); }}
        />
      )}
    </div>
  );
};
