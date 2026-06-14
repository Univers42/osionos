/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   BaasConsolePanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The BaaS console container: a left section-nav (Account / API Keys / Usage /
 * Plan) over the active section. Hydrates the tenant store on mount. When the
 * BaaS env is absent it renders a single "connect a project" empty state — so a
 * stock build shows nothing actionable here (parity-safe).
 */

import React, { useEffect, useState } from "react";

import { useTenantConsoleStore } from "../model/useTenantConsoleStore";
import { ConsoleEmpty } from "./consolePrimitives";
import { TenantAccountSection } from "./TenantAccountSection";
import { PlanPanel } from "./PlanPanel";
import { ApiKeysSection } from "./ApiKeysSection";
import { UsageSection } from "./UsageSection";

type ConsoleTabId = "account" | "keys" | "usage" | "plan";

const NAV: ReadonlyArray<{ id: ConsoleTabId; label: string }> = [
  { id: "account", label: "Account" },
  { id: "keys", label: "API Keys" },
  { id: "usage", label: "Usage" },
  { id: "plan", label: "Plan" },
];

function renderSection(active: ConsoleTabId): React.ReactNode {
  switch (active) {
    case "keys":
      return <ApiKeysSection />;
    case "usage":
      return <UsageSection />;
    case "plan":
      return <PlanPanel />;
    case "account":
    default:
      return <TenantAccountSection />;
  }
}

export const BaasConsolePanel: React.FC = () => {
  const configured = useTenantConsoleStore((s) => s.configured);
  const hydrate = useTenantConsoleStore((s) => s.hydrate);
  const [active, setActive] = useState<ConsoleTabId>("account");

  useEffect(() => {
    if (configured) void hydrate();
  }, [configured, hydrate]);

  if (!configured) {
    return (
      <div className="h-full overflow-auto bg-[var(--osio-bg-page)]">
        <ConsoleEmpty message="Connect a mini-baas project (set VITE_BAAS_URL + VITE_BAAS_API_KEY) to manage it here." />
      </div>
    );
  }

  return (
    <div className="h-full flex bg-[var(--osio-bg-page)]">
      <nav className="w-48 shrink-0 border-r border-[var(--osio-border-default)] p-3 flex flex-col gap-px">
        <h1 className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">
          BaaS Console
        </h1>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={`px-2 py-1.5 rounded-md text-left text-sm transition-colors ${
              active === item.id
                ? "bg-[var(--osio-bg-hover)] text-[var(--osio-fg-default)] font-medium"
                : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl px-8 py-8">{renderSection(active)}</div>
      </div>
    </div>
  );
};
