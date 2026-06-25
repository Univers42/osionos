/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TabButton.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Database, Folder, Images, LayoutDashboard, Network, X } from "lucide-react";
import { IconValueView } from "@/shared/ui/atoms/IconValueView";
import { useSidebarTreeDnd } from "@/widgets/sidebar/model/sidebarTreeDnd";
import { useHomeVariantStore, type HomeVariant } from "@/widgets/home-variants/model/homeVariantStore";
import type { WorkspaceTab } from "../model/layoutTree";
import { TAB_DND_MIME } from "../model/paneDropZone";

/** The Home surfaces, unfolded from the Home tab itself. */
const HOME_ITEMS: Array<{ id: HomeVariant; label: string; icon: React.ReactNode }> = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} aria-hidden="true" /> },
  { id: "graph", label: "Second Brain", icon: <Network size={15} aria-hidden="true" /> },
  { id: "database", label: "Database", icon: <Database size={15} aria-hidden="true" /> },
  { id: "workspace", label: "Gallery", icon: <Images size={15} aria-hidden="true" /> },
];

interface Props {
  tab: WorkspaceTab;
  paneId: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  /** Highlighted as the drop target that will be REPLACED by a dragged file. */
  replaceTarget?: boolean;
}

/** One onglet: draggable between panes, click to focus, × to close. The Home tab
 *  is icon-only (the house glyph IS the label — aria/title carry the meaning) and
 *  unfolds the Dashboard / Second Brain / Database / Gallery surfaces on click. */
export const TabButton: React.FC<Props> = ({ tab, paneId, active, onSelect, onClose, replaceTarget }) => {
  const beginTabDrag = useSidebarTreeDnd((s) => s.beginTabDrag);
  const endDrag = useSidebarTreeDnd((s) => s.endDrag);
  const isHome = tab.kind === "home";
  const variant = useHomeVariantStore((s) => s.variant);
  const setVariant = useHomeVariantStore((s) => s.setVariant);
  const ref = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-home-tab-menu]") && !ref.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  // The tab strip is overflow-x-auto, which clips an in-flow dropdown — anchor the
  // menu with position:fixed computed from the tab's rect so it escapes the clip.
  const handleTabClick = () => {
    if (!isHome) { onSelect(); return; }
    if (!menuOpen && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 4, left: r.left });
    }
    setMenuOpen((open) => !open);
  };

  const pickVariant = (id: HomeVariant) => {
    setVariant(id);
    onSelect();
    setMenuOpen(false);
  };

  return (
    <div
      ref={ref}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(TAB_DND_MIME, JSON.stringify({ paneId, tabId: tab.tabId, tab }));
        beginTabDrag();
      }}
      onDragEnd={endDrag}
      onClick={handleTabClick}
      title={tab.title || "Untitled"}
      aria-haspopup={isHome ? "menu" : undefined}
      aria-expanded={isHome ? menuOpen : undefined}
      data-tab-id={tab.tabId}
      className={[
        "group/tab relative flex items-center gap-1 h-8 pl-2 pr-1 max-w-[180px] shrink-0 cursor-pointer select-none",
        "border-r border-[var(--osio-border-default)] text-xs transition-colors duration-[120ms]",
        active
          ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-strong)] shadow-[inset_0_-2px_0_var(--osio-accent)]"
          : "bg-[var(--osio-bg-page)] text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]",
        replaceTarget ? "ring-2 ring-inset ring-[var(--osio-accent)] bg-[var(--osio-accent-subtle)]" : "",
      ].join(" ")}
    >
      {tab.kind === "folder"
        ? <Folder size={14} className="shrink-0 text-[var(--osio-fg-muted)]" />
        : <IconValueView value={tab.icon ?? "icon:page"} size={14} className="shrink-0" />}
      {/* Home tab is icon-only; its title lives in aria/title (hover) instead. */}
      {!isHome && <span className="truncate flex-1">{tab.title || "Untitled"}</span>}
      {isHome && <ChevronDown size={13} aria-hidden="true" className="shrink-0 text-[var(--osio-fg-muted)]" />}
      <button
        type="button"
        className="shrink-0 rounded-md p-0.5 opacity-0 transition-colors duration-[120ms] group-hover/tab:opacity-100 hover:bg-[var(--osio-bg-hover)]"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close tab"
      >
        <X size={14} />
      </button>

      {isHome && menuOpen && (
        <div
          data-home-tab-menu
          role="menu"
          style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
          className="z-50 min-w-[200px] rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1.5 shadow-[var(--osio-shadow-menu)]"
        >
          {HOME_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); pickVariant(item.id); }}
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
