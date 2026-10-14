/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MenuDropdown.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { MenuItem } from "../model/menus";

interface MenuDropdownProps {
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
}

/** A single menubar dropdown panel (popover tier, token-styled). */
export const MenuDropdown: React.FC<MenuDropdownProps> = ({ items, onSelect }) => (
  <div
    role="menu"
    className="osio-surface-overlay absolute left-0 top-full z-[var(--osio-z-popover)] mt-1 min-w-[210px]"
  >
    {items.map((item) => (
      <React.Fragment key={item.id}>
        <button
          type="button"
          role="menuitem"
          onClick={() => onSelect(item)}
          className="flex h-[var(--osio-control-h-sm)] w-full items-center justify-between gap-6 rounded-[var(--osio-radius-sm)] px-2 text-left text-sm text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:bg-[var(--osio-bg-hover)] focus-visible:outline-none"
        >
          <span>{item.label}</span>
          {item.accelerator && (
            <span className="font-mono text-xs text-[var(--osio-fg-subtle)]">{item.accelerator}</span>
          )}
        </button>
        {item.separatorAfter && <div className="my-1 h-px bg-[var(--osio-border-default)]" aria-hidden />}
      </React.Fragment>
    ))}
  </div>
);
