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
          className="osio-menu-item justify-between"
        >
          <span>{item.label}</span>
          {item.accelerator && (
            <span className="pl-6 font-mono text-xs text-[var(--osio-fg-subtle)]">{item.accelerator}</span>
          )}
        </button>
        {item.separatorAfter && <div className="osio-menu-separator" aria-hidden />}
      </React.Fragment>
    ))}
  </div>
);
