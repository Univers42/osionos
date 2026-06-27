/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AgentsPanel.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo } from "react";
import { Bot } from "lucide-react";
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";
import type { PageEntry } from "@/entities/page";

const EMPTY: readonly PageEntry[] = [];

/** Agents panel: every page with surface 'agent' in the active workspace. */
export const AgentsPanel: React.FC = () => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const activePageId = usePageStore((s) => s.activePage?.id ?? null);
  const openPage = usePageStore((s) => s.openPage);
  const pages = usePageStore((s) => s.pages[workspaceId] ?? EMPTY);

  const agents = useMemo(
    () => pages.filter((p) => p.surface === "agent" && !p.archivedAt && !p.parentPageId),
    [pages],
  );

  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-2 pb-5">
      <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
        Agents
      </p>
      {agents.length === 0 ? (
        <p className="px-2 py-3 text-xs text-[var(--osio-fg-subtle)]">No agents yet.</p>
      ) : (
        agents.map((agent) => (
          <button
            key={agent._id}
            type="button"
            aria-current={activePageId === agent._id || undefined}
            onClick={() =>
              openPage({ id: agent._id, workspaceId, kind: "page", title: agent.title, icon: agent.icon })
            }
            className={[
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-[120ms]",
              activePageId === agent._id
                ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
                : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
            ].join(" ")}
          >
            {agent.icon ? (
              <IconValueView value={agent.icon} size={16} className="shrink-0" />
            ) : (
              <Bot size={16} className="shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate">{agent.title || "Untitled agent"}</span>
          </button>
        ))
      )}
    </nav>
  );
};
