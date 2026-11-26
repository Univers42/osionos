/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TopBarMenu.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef } from "react";
import { cx } from "@osionos/ui/shared/classNames";
import type { MenuAction, MenuGroup } from "../model/menuTypes";
import { MenuDropdown } from "./MenuDropdown";
import { useFocusReturn } from "./useFocusReturn";
import { useMenuNavigation } from "./useMenuNavigation";

interface TopBarMenuProps {
  groups: MenuGroup[];
}

/**
 * WAI-ARIA menubar: click opens, hovering switches while open, arrows rove real
 * focus, Escape closes one level and returns focus. Only the open menu is in
 * the DOM, so at most one top `role=menu` (plus one submenu) exists at a time.
 */
export const TopBarMenu: React.FC<TopBarMenuProps> = ({ groups }) => {
  const barRef = useRef<HTMLElement>(null);
  const ids = groups.map((group) => group.id);
  const nav = useMenuNavigation(barRef, ids);
  const focusReturn = useFocusReturn(barRef);
  const rovingId = nav.openId ?? ids[0];

  function handleSelect(item: MenuAction): void {
    nav.close();
    focusReturn.activate(item);
  }

  return (
    <nav
      ref={barRef}
      className="flex items-center"
      aria-label="Application menu"
      aria-keyshortcuts={nav.keyshortcuts}
      onKeyDown={nav.onKeyDown}
      {...focusReturn.captureProps}
    >
      {groups.map((group) => (
        <div key={group.id} className="relative">
          <button
            type="button"
            data-menu-trigger
            aria-haspopup="menu"
            aria-expanded={nav.openId === group.id}
            tabIndex={rovingId === group.id ? 0 : -1}
            onClick={() => nav.toggle(group.id)}
            onPointerEnter={() => nav.hover(group.id)}
            className={cx(
              "rounded-xs px-2 py-1 text-sm text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]",
              nav.openId === group.id && "bg-[var(--osio-bg-hover)] text-[var(--osio-fg-default)]",
            )}
          >
            {group.label}
          </button>
          {nav.openId === group.id && (
            <MenuDropdown items={group.items} onSelect={handleSelect} subId={nav.subId} onSub={nav.setSub} />
          )}
        </div>
      ))}
    </nav>
  );
};
