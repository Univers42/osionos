/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PublicSwitcherPanel.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { useUserStore } from "@/features/auth";
import { useUIStore } from "@/shared/config/uiStore";
import type { Workspace } from "@/entities/user/model/types";

const EMPTY: readonly Workspace[] = [];

/** Shared/joined projects (member, non-owner workspaces) — the "Shared" space
 *  (renamed from "Public", AOC §12; component id kept stable, R-R3). Virtualized
 *  for large lists; selecting one switches the active workspace and jumps to Files. */
export const PublicSwitcherPanel: React.FC = () => {
  const joined = useUserStore((s) => s.activeSession()?.sharedWorkspaces ?? EMPTY);
  const activeWorkspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const switchWorkspace = useUserStore((s) => s.switchWorkspace);
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? joined.filter((w) => w.name.toLowerCase().includes(q)) : [...joined];
  }, [joined, query]);

  // TanStack Virtual returns non-memoizable functions (sanctioned: see PageBlocksRenderer).
  // eslint-disable-next-line react-hooks/incompatible-library
  const rows = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

  const select = (ws: Workspace) => {
    switchWorkspace(ws._id);
    setActivePanel("files");
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="px-2 pt-2 pb-1">
        <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--osio-fg-subtle)]">
          Shared
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter projects"
          aria-label="Filter shared projects"
          className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-2 py-1.5 text-sm text-[var(--osio-fg-default)] outline-none focus:border-[var(--osio-accent)]"
        />
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-3 text-xs text-[var(--osio-fg-subtle)]">No joined projects.</p>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pb-3">
          <div style={{ height: rows.getTotalSize(), position: "relative", width: "100%" }}>
            {rows.getVirtualItems().map((v) => {
              const ws = items[v.index];
              const active = ws._id === activeWorkspaceId;
              return (
                <button
                  key={ws._id}
                  type="button"
                  aria-current={active || undefined}
                  onClick={() => select(ws)}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: v.size, transform: `translateY(${v.start}px)` }}
                  className={[
                    "flex items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-[120ms]",
                    active
                      ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]"
                      : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
                  ].join(" ")}
                >
                  {ws.icon ? (
                    <IconValueView value={ws.icon} size={16} className="shrink-0" />
                  ) : (
                    <Globe size={16} className="shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{ws.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
