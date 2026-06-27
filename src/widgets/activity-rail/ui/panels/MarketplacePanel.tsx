/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarketplacePanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useMemo, useState } from "react";
import { Store, Plus } from "lucide-react";

import type { PageEntry } from "@/entities/page";
import { useMarketplaceApps, createApp } from "@/features/marketplace/model/useMarketplaceApps";
import { useInstalledApps } from "@/features/marketplace/model/useInstalledApps";
import { readAppMeta } from "@/features/marketplace/model/appMeta";
import { MarketplaceAppRow } from "@/features/marketplace/ui/MarketplaceAppRow";
import { MarketplaceDetailModal } from "@/features/marketplace/ui/MarketplaceDetailModal";
import { MarketplaceAppEditor } from "@/features/marketplace/ui/MarketplaceAppEditor";

/** Extensions panel: Drafts / Installed / Recommended, search, "+ Add app", detail overlay + editor. */
export const MarketplacePanel: React.FC = () => {
  const { apps, loading, error, reload } = useMarketplaceApps();
  const install = useInstalledApps();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<PageEntry | null>(null);
  useEffect(() => useInstalledApps.getState().load(), []);

  const addApp = async () => {
    const created = await createApp("New app");
    if (created) {
      reload();
      setEditing(created);
    }
  };

  const { drafts, installed, recommended } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const dft: typeof apps = [];
    const inApp: typeof apps = [];
    const rec: typeof apps = [];
    for (const a of apps) {
      const m = readAppMeta(a);
      if (q && ![a.title, m.company, m.description].some((s) => s.toLowerCase().includes(q))) continue;
      if (!m.published) dft.push(a);
      else if (install.isInstalled(m.identifier)) inApp.push(a);
      else rec.push(a);
    }
    return { drafts: dft, installed: inApp, recommended: rec };
  }, [apps, query, install]);

  const open = (app: PageEntry) => (readAppMeta(app).published ? setSelected(app._id) : setEditing(app));

  const section = (label: string, list: typeof apps) =>
    list.length ? (
      <div>
        <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">{label}</p>
        {list.map((app) => (
          <MarketplaceAppRow
            key={app._id}
            app={app}
            installed={install.isInstalled(readAppMeta(app).identifier)}
            isDraft={!readAppMeta(app).published}
            onOpen={() => open(app)}
            onInstall={readAppMeta(app).published ? () => install.install(app) : undefined}
            onConfig={() => open(app)}
          />
        ))}
      </div>
    ) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 px-2 pt-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search apps in Marketplace"
          aria-label="Search apps in Marketplace"
          className="min-w-0 flex-1 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1.5 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--osio-accent)]"
        />
        <button type="button" onClick={addApp} aria-label="Add app" title="Add a new app" className="shrink-0 rounded-md border border-[var(--osio-border-default)] p-1.5 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]">
          <Plus size={16} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-5">
        {!loading && (error || apps.length === 0) ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Store size={24} strokeWidth={1.5} className="text-[var(--osio-fg-subtle)]" />
            <p className="text-xs text-[var(--osio-fg-subtle)]">{error ? "Marketplace unavailable." : "No apps yet — add one with +."}</p>
          </div>
        ) : (
          <>
            {section("Your drafts", drafts)}
            {section("Installed", installed)}
            {section("Recommended", recommended)}
          </>
        )}
      </nav>
      <MarketplaceDetailModal appId={selected} onClose={() => setSelected(null)} />
      {editing ? <MarketplaceAppEditor app={editing} onClose={() => setEditing(null)} onSaved={reload} /> : null}
    </div>
  );
};
