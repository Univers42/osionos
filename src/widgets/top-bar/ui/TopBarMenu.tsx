/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TopBarMenu.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";
import { cx } from "@/shared/ui/shared/classNames";
import type { MenuGroup, MenuItem } from "../model/menus";
import { MenuDropdown } from "./MenuDropdown";

interface TopBarMenuProps {
  groups: MenuGroup[];
}

/** VSCode-style menubar: click opens, hovering switches while open, click-away / Esc closes. */
export const TopBarMenu: React.FC<TopBarMenuProps> = ({ groups }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;
    function onPointerDown(event: PointerEvent): void {
      if (!barRef.current?.contains(event.target as Node)) setOpenId(null);
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpenId(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  function handleSelect(item: MenuItem): void {
    setOpenId(null);
    item.run();
  }

  return (
    <nav ref={barRef} className="flex items-center" aria-label="Application menu">
      {groups.map((group) => (
        <div key={group.id} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={openId === group.id}
            onClick={() => setOpenId((current) => (current === group.id ? null : group.id))}
            onPointerEnter={() => setOpenId((current) => (current ? group.id : current))}
            className={cx(
              "rounded px-2 py-1 text-sm text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]",
              openId === group.id && "bg-[var(--osio-bg-hover)] text-[var(--osio-fg-default)]",
            )}
          >
            {group.label}
          </button>
          {openId === group.id && <MenuDropdown items={group.items} onSelect={handleSelect} />}
        </div>
      ))}
    </nav>
  );
};
