/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ModelMenuParts.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+       */
/*                                                +#+#+#+#+#+   +#+           */
/*    Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#            */
/*    Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr      */
/*                                                                            */
/* ************************************************************************** */

/** The rows and panels of the model menu: presentation only, the state lives in ModelMenu. */

import React from "react";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";

import { Badge, IconButton, Menu, MenuItem } from "@/shared/ui";
import type { ModelFamily, ModelRow } from "@/features/ai/model/modelMenu";

const TINT: Record<ModelFamily, string> = { claude: "orange", gemini: "blue", gpt: "green", grok: "gray", open: "purple", other: "gray" };
const INITIALS: Record<ModelFamily, string> = { claude: "Cl", gemini: "Ge", gpt: "GP", grok: "Gk", open: "Op", other: "··" };

/** A neutral mark for a provider family: initials on a token tint, never a brand logo. */
export const FamilyMark: React.FC<{ family: ModelFamily }> = ({ family }) => (
  <span
    aria-hidden="true"
    style={{ background: `var(--osio-block-tint-${TINT[family]}-bg)`, color: `var(--osio-block-tint-${TINT[family]}-fg)` }}
    className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-3xs font-semibold leading-none"
  >
    {INITIALS[family]}
  </span>
);

const CheckMark: React.FC = () => <Check size={14} aria-hidden="true" className="ml-auto shrink-0 text-[var(--osio-accent)]" />;

interface RowProps {
  row: ModelRow;
  onPick: (row: ModelRow) => void;
  /** Draws the star: the pin that moves a model into Recommended. */
  onStar?: (row: ModelRow) => void;
}

export const ModelRowItem: React.FC<RowProps> = ({ row, onPick, onStar }) => (
  <div className="flex items-center">
    <MenuItem
      role="menuitemradio"
      aria-checked={row.selected}
      data-menu-item=""
      icon={<FamilyMark family={row.family} />}
      onClick={() => onPick(row)}
      className="min-w-0 flex-1"
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 truncate">{row.label}</span>
        {row.reasoning ? <Badge tone="accent">Reasoning</Badge> : null}
        {row.selected ? <CheckMark /> : null}
      </span>
    </MenuItem>
    {onStar ? (
      <IconButton
        label={row.starred ? `Unpin ${row.label} from Recommended` : `Pin ${row.label} to Recommended`}
        role="menuitemcheckbox"
        aria-checked={row.starred}
        data-menu-item=""
        data-menu-star=""
        onClick={() => onStar(row)}
        className={row.starred ? "text-[var(--osio-accent)]" : undefined}
      >
        <Star size={14} aria-hidden="true" fill={row.starred ? "currentColor" : "none"} />
      </IconButton>
    ) : null}
  </div>
);

export const AutoItem: React.FC<{ selected: boolean; onPick: () => void }> = ({ selected, onPick }) => (
  <MenuItem role="menuitemradio" aria-checked={selected} data-menu-item="" onClick={onPick}>
    <span className="flex items-center gap-2">
      <span className="min-w-0">
        <span className="block truncate">Auto</span>
        <span className="block truncate text-xs text-[var(--osio-fg-muted)]">Balances speed, effort, and cost.</span>
      </span>
      {selected ? <CheckMark /> : null}
    </span>
  </MenuItem>
);

interface TriggerProps {
  id: string;
  open: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onOpen: () => void;
}

/** A row that opens a submenu: the arrow key and the click both do it. */
export const SubmenuTrigger: React.FC<TriggerProps> = ({ id, open, icon, children, onOpen }) => (
  <MenuItem role="menuitem" aria-haspopup="menu" aria-expanded={open} data-menu-item="" data-submenu={id} icon={icon} onClick={onOpen}>
    <span className="flex items-center gap-2">
      <span className="min-w-0 truncate">{children}</span>
      <ChevronRight size={14} aria-hidden="true" className="ml-auto shrink-0 text-[var(--osio-fg-subtle)]" />
    </span>
  </MenuItem>
);

export const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="presentation" className="px-3 pb-1 pt-2 text-xs font-medium text-[var(--osio-fg-muted)]">{children}</div>
);

export const Divider: React.FC = () => <div role="separator" className="my-1 h-px bg-[var(--osio-border-soft)]" />;

interface PanelProps {
  depth: number;
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}

/**
 * One panel of the cascade. The main panel (depth 0) is the popover itself; a
 * submenu opens to its left, one step further per level. Under 640px a submenu
 * covers the panel it came from instead, with a way back, so nothing leaves the screen.
 */
export const MenuPanel: React.FC<PanelProps> = ({ depth, title, children, onBack }) => {
  if (depth === 0) {
    return (
      <div role="menu" aria-label={title} data-menu-panel="" data-menu-depth={0} className="w-[min(280px,calc(100vw-4rem))] max-w-full">
        {children}
      </div>
    );
  }
  const shift = { "--osm-shift": `calc(100% + 4px + ${(depth - 1) * 264}px)` } as React.CSSProperties;
  return (
    <Menu
      aria-label={title}
      data-menu-panel=""
      data-menu-depth={depth}
      style={shift}
      className="absolute top-0 z-10 max-h-[min(70vh,26rem)] w-[260px] overflow-y-auto right-[var(--osm-shift)] max-[639px]:inset-x-0 max-[639px]:bottom-0 max-[639px]:max-h-none max-[639px]:w-auto"
    >
      <MenuItem data-menu-item="" data-menu-back="" icon={<ChevronLeft size={14} aria-hidden="true" />} onClick={onBack} className="min-[640px]:hidden">
        {title}
      </MenuItem>
      {children}
    </Menu>
  );
};
