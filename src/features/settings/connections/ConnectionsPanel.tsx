/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConnectionsPanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*                                                +#+#+#+#+#+   +#+           */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Search } from "lucide-react";

import { MiniTabs } from "@/shared/ui";
import { useConnectionsStore } from "@/store/settings";
import type { ConnectionRecord } from "@/store/settings";
import { CONNECTIONS_CATALOG, CONNECTIONS_CATEGORIES, ConnIcon, findConnApp, type ConnApp } from "./connectionsCatalog";
import { beginConnect } from "./connectionsOAuth";

type TabId = "discover" | "installed";

const AppCard: React.FC<{ app: ConnApp; connected: boolean; busy: boolean; onConnect: () => void; onDisconnect: () => void }> = ({ app, connected, busy, onConnect, onDisconnect }) => (
  <div className="flex items-start gap-3 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-3">
    <ConnIcon app={app} size={36} />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium text-[var(--osio-fg-default)]">{app.name}</span>
        {app.live && <span className="rounded-full bg-[var(--osio-accent)]/12 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-[var(--osio-accent-text)]">Live</span>}
      </div>
      <p className="mt-0.5 line-clamp-2 text-xs leading-[16px] text-[var(--osio-fg-muted)]">{app.description}</p>
    </div>
    <button
      type="button"
      data-testid={`connection-toggle-${app.id}`}
      disabled={busy}
      onClick={connected ? onDisconnect : onConnect}
      className={
        connected
          ? "shrink-0 rounded-md border border-[var(--osio-border-default)] px-3 py-1 text-sm font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:opacity-50"
          : "shrink-0 rounded-md bg-[var(--osio-accent)] px-3 py-1 text-sm font-medium text-[var(--osio-accent-fg)] hover:bg-[var(--osio-accent-hover)] disabled:opacity-50"
      }
    >
      {connected ? "Connected" : app.live ? "Connect" : "Add"}
    </button>
  </div>
);

const DiscoverGrid: React.FC<{ isConnected: (id: string) => boolean; busyId: string | null; onConnect: (a: ConnApp) => void; onDisconnect: (a: ConnApp) => void }> = ({ isConnected, busyId, onConnect, onDisconnect }) => {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CONNECTIONS_CATALOG.filter((a) => !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5">
        <Search size={15} className="text-[var(--osio-fg-subtle)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search connections"
          aria-label="Search connections"
          data-testid="connection-search"
          className="h-9 w-full bg-transparent text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none"
        />
      </div>
      {CONNECTIONS_CATEGORIES.map((category) => {
        const apps = matches.filter((a) => a.category === category);
        if (apps.length === 0) return null;
        return (
          <section key={category} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-subtle)]">{category}</h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {apps.map((app) => (
                <AppCard key={app.id} app={app} connected={isConnected(app.id)} busy={busyId === app.id} onConnect={() => onConnect(app)} onDisconnect={() => onDisconnect(app)} />
              ))}
            </div>
          </section>
        );
      })}
      {matches.length === 0 && <p className="py-6 text-center text-sm text-[var(--osio-fg-muted)]">No connections match “{query}”.</p>}
    </div>
  );
};

const InstalledList: React.FC<{ records: ConnectionRecord[]; onDisconnect: (a: ConnApp) => void }> = ({ records, onDisconnect }) => {
  const rows = records.map((r) => ({ record: r, app: findConnApp(r.provider) })).filter((x): x is { record: ConnectionRecord; app: ConnApp } => Boolean(x.app));
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-[var(--osio-fg-muted)]">No connections yet. Add one from the Discover tab.</p>;
  return (
    <div className="divide-y divide-[var(--osio-border-default)] rounded-lg border border-[var(--osio-border-default)] px-3">
      {rows.map(({ record, app }) => (
        <div key={record._id} className="flex items-center gap-3 py-2.5">
          <ConnIcon app={app} size={28} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--osio-fg-default)]">{app.name}</div>
            <div className="truncate text-xs text-[var(--osio-fg-muted)]">{app.live ? "Authorized via OAuth" : "Added to your workspace"}</div>
          </div>
          <button type="button" data-testid={`connection-disconnect-${app.id}`} onClick={() => onDisconnect(app)} className="rounded-md px-2.5 py-1 text-sm font-medium text-[var(--osio-danger)] hover:bg-[var(--osio-danger)]/10">Disconnect</button>
        </div>
      ))}
    </div>
  );
};

export const ConnectionsPanel: React.FC<{ activeUserId: string; personaEmail?: string }> = ({ activeUserId, personaEmail }) => {
  const userId = activeUserId || "anonymous";
  const connections = useConnectionsStore((s) => s.data);
  const hydrate = useConnectionsStore((s) => s.hydrate);
  const connect = useConnectionsStore((s) => s.connect);
  const disconnect = useConnectionsStore((s) => s.disconnect);
  const [tab, setTab] = useState<TabId>("discover");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { void hydrate(userId, personaEmail); }, [hydrate, personaEmail, userId]);

  const installed = useMemo(() => connections.filter((c) => !c.removedAt && findConnApp(c.provider)), [connections]);
  const isConnected = (id: string) => installed.some((c) => c.provider === id);
  const recordFor = (id: string) => installed.find((c) => c.provider === id) ?? null;

  async function onConnect(app: ConnApp) {
    setBusyId(app.id);
    try {
      // Google apps authenticate for real; the rest are added to the workspace registry.
      if (app.live && (await beginConnect(app, userId))) return;
      await connect({ userId, provider: app.id, label: app.name, scopes: app.scope ? [app.scope] : [], status: "connected" });
    } finally { setBusyId(null); }
  }
  async function onDisconnect(app: ConnApp) {
    const rec = recordFor(app.id);
    if (rec) await disconnect(rec._id);
  }

  return (
    <section className="space-y-5" data-testid="connections-panel">
      <div className="rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--osio-bg-subtle)] text-[var(--osio-accent)]"><LayoutGrid size={16} /></span>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-medium text-[var(--osio-fg-default)]">Connect the apps you use with osionos</h4>
            <p className="mt-1 text-sm leading-[18px] text-[var(--osio-fg-muted)]">Google apps sign in with real OAuth. Other apps are added to your workspace and activate fully once their provider credentials are configured.</p>
          </div>
        </div>
      </div>

      <MiniTabs<TabId>
        value={tab}
        onChange={setTab}
        options={[{ value: "discover", label: "Discover" }, { value: "installed", label: "Installed", count: installed.length }]}
      />

      {tab === "discover"
        ? <DiscoverGrid isConnected={isConnected} busyId={busyId} onConnect={onConnect} onDisconnect={onDisconnect} />
        : <InstalledList records={installed} onDisconnect={onDisconnect} />}
    </section>
  );
};
