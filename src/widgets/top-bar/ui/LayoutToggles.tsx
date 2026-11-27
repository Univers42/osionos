/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   LayoutToggles.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { PanelBottom, PanelLeft } from "lucide-react";
import { useUIStore } from "@/shared/config/uiStore";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";
import { cx } from "@osionos/ui/shared/classNames";
import { CustomizeLayoutMenu } from "./CustomizeLayoutMenu";

const BUTTON = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--osio-radius-chip)] transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]";

interface ToggleProps {
  label: string;
  pressed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/** One pressed/unpressed region toggle; the label names the region, never the verb. */
const Toggle: React.FC<ToggleProps> = ({ label, pressed, onToggle, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={pressed}
    onClick={onToggle}
    className={cx(BUTTON, pressed ? "text-[var(--osio-accent-text)]" : "text-[var(--osio-fg-muted)]")}
  >
    {children}
  </button>
);

/** Primary side bar and bottom panel toggles plus Customize Layout, the same actions as Ctrl+Alt+B and View › Appearance. */
export const LayoutToggles: React.FC = () => {
  const sidebarPanel = useUIStore((state) => state.sidebarMode === "panel");
  const toggleDocked = useUIStore((state) => state.toggleDocked);
  const dockOpen = useWorkbenchStore((state) => state.dockOpen);
  const toggleDock = useWorkbenchStore((state) => state.toggleDock);
  return (
    <>
      <Toggle label="Primary side bar" pressed={sidebarPanel} onToggle={toggleDocked}><PanelLeft size={16} aria-hidden /></Toggle>
      <Toggle label="Panel" pressed={dockOpen} onToggle={toggleDock}><PanelBottom size={16} aria-hidden /></Toggle>
      <CustomizeLayoutMenu />
    </>
  );
};
