/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MarketplaceActionBar.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Settings, Check } from "lucide-react";

import { Button } from "@/shared/ui/atoms/Button";
import type { PageEntry } from "@/entities/page";

import { readAppMeta } from "../model/appMeta";
import { useInstalledApps } from "../model/useInstalledApps";
import { launchApp } from "../model/marketplaceActions";

/** State-aware app controls: Install ↔ Open/Deactivate(Activate)/Uninstall + Auto-Update + ⚙. */
export const MarketplaceActionBar: React.FC<{ app: PageEntry }> = ({ app }) => {
  const id = readAppMeta(app).identifier;
  const entry = useInstalledApps((s) => s.installed[id]);
  const { install, uninstall, setActive, toggleAutoUpdate } = useInstalledApps.getState();
  const installed = Boolean(entry);
  const active = Boolean(entry?.active);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!installed ? (
        <Button tone="primary" onClick={() => { install(app); launchApp(app); }}>Install</Button>
      ) : active ? (
        <>
          <Button tone="default" onClick={() => launchApp(app)}>Open</Button>
          <Button tone="ghost" onClick={() => setActive(id, false)}>Deactivate</Button>
        </>
      ) : (
        <Button tone="primary" onClick={() => setActive(id, true)}>Activate</Button>
      )}

      {installed ? (
        <>
          <Button tone="danger" onClick={() => uninstall(id)}>Uninstall</Button>
          <button
            type="button"
            onClick={() => toggleAutoUpdate(id)}
            aria-pressed={Boolean(entry?.autoUpdate)}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${entry?.autoUpdate ? "border-[var(--osio-accent)] bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]" : "border-[var(--osio-border-default)]"}`}>
              {entry?.autoUpdate ? <Check size={12} /> : null}
            </span>
            Auto Update
          </button>
        </>
      ) : null}

      <button type="button" onClick={() => launchApp(app)} aria-label="Configure" className="rounded p-1.5 text-[var(--osio-fg-subtle)] hover:text-[var(--osio-fg-default)]">
        <Settings size={16} />
      </button>
    </div>
  );
};
