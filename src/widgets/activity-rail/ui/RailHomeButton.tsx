/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RailHomeButton.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Home launcher on the activity rail. Clicking the house pops a little menu of
 * the home surfaces (Dashboard / Second Brain / Database / Gallery); picking one
 * sets the home variant and focuses the Home tab. This moves the home-variant
 * picker OUT of the tab strip and into the left sidebar, so people can open any
 * home variant directly (handy for debugging each surface).
 */

import React, { useEffect, useRef, useState } from "react";
import { Database, Home, Images, LayoutDashboard, Network } from "lucide-react";

import { useHomeVariantStore, type HomeVariant } from "@/widgets/home-variants/model/homeVariantStore";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { homeTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useEscapeKey } from "@/shared/ui";
import { RailIcon } from "./RailIcon";

const HOME_VARIANTS: Array<{ id: HomeVariant; label: string; Icon: typeof Home }> = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { id: "graph", label: "Second Brain", Icon: Network },
  { id: "database", label: "Database", Icon: Database },
  { id: "workspace", label: "Gallery", Icon: Images },
];

export const RailHomeButton: React.FC = () => {
  const variant = useHomeVariantStore((s) => s.variant);
  const ref = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest("[data-rail-home-menu]") && !ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Escape returns focus to the rail icon so keyboard users resume where they were.
  useEscapeKey(() => {
    setOpen(false);
    ref.current?.querySelector("button")?.focus();
  }, open);

  const toggle = () => {
    // The rail clips an in-flow dropdown; anchor with position:fixed to its right.
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.top, left: rect.right + 6 });
    }
    setOpen((value) => !value);
  };

  const pick = (id: HomeVariant) => {
    useHomeVariantStore.getState().setVariant(id);
    const layout = useWorkspaceLayout.getState();
    layout.openTab(homeTab(), layout.activePaneId); // dedups on the Home tab id → focuses it
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <RailIcon label="Home" Icon={Home} active={open} onClick={toggle} />
      {open ? (
        <div
          data-rail-home-menu
          role="menu"
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="osio-surface-overlay z-[var(--osio-z-modal)] min-w-[184px]"
        >
          <div className="osio-menu-label">Home</div>
          {HOME_VARIANTS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => pick(item.id)}
              data-tone={variant === item.id ? "accent" : undefined}
              className={`osio-menu-item ${variant === item.id ? "bg-[var(--osio-accent-subtle)]" : ""}`}
            >
              <item.Icon size={15} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
