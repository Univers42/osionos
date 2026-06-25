/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   HomeVariantControl.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Database, Home, Images, LayoutDashboard, Network } from "lucide-react";

import { homeTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { useHomeVariantStore, type HomeVariant } from "../model/homeVariantStore";

const ITEMS: Array<{ id: HomeVariant; label: string; icon: React.ReactNode }> = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} aria-hidden="true" /> },
  { id: "graph", label: "Second Brain", icon: <Network size={16} aria-hidden="true" /> },
  { id: "database", label: "Database", icon: <Database size={16} aria-hidden="true" /> },
  { id: "workspace", label: "Gallery", icon: <Images size={16} aria-hidden="true" /> },
];

/**
 * Global top-bar Home control. The house glyph IS the label (aria-label/title
 * carry the meaning, no redundant visible "Home"); clicking it unfolds the
 * Dashboard / Second Brain / Database / Gallery surfaces. Selecting one opens
 * the Home tab and switches its surface — so these views live in the header on
 * every page instead of floating above the Home content.
 */
export const HomeVariantControl: React.FC = () => {
  const variant = useHomeVariantStore((s) => s.variant);
  const setVariant = useHomeVariantStore((s) => s.setVariant);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const select = (id: HomeVariant) => {
    setVariant(id);
    useWorkspaceLayout.getState().openTab(homeTab());
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Home"
        title="Home"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        className={`inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)] ${
          open
            ? "bg-[var(--osio-bg-hover)] text-[var(--osio-fg-default)]"
            : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        }`}
      >
        <Home size={16} aria-hidden="true" />
        <ChevronDown size={13} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+4px)] z-40 min-w-[210px] rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1.5 shadow-[var(--osio-shadow-menu)]"
        >
          {ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => select(item.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                variant === item.id
                  ? "bg-[var(--osio-accent-subtle)] text-[var(--osio-accent-text)]"
                  : "text-[var(--osio-fg-default)] hover:bg-[var(--osio-accent-subtle)] hover:text-[var(--osio-accent-text)]"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
