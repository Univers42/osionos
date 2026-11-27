/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CustomizeLayoutMenu.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React, { useRef } from "react";
import { LayoutTemplate } from "lucide-react";

import { workbenchPositionMenu } from "@/widgets/workbench/model/workbenchMenuActions";
import type { MenuAction, MenuItem } from "../model/menuTypes";
import { appearanceSubmenu } from "../model/menus/appearanceMenu";
import { MenuDropdown } from "./MenuDropdown";
import { useFocusReturn } from "./useFocusReturn";
import { useMenuNavigation } from "./useMenuNavigation";

const BUTTON = "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--osio-radius-chip)] text-[var(--osio-fg-muted)] transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]";

const MENU_ID = "customize-layout";
const IDS = [MENU_ID] as const;

/** Every layout switch in one list: the Appearance rows, then the "Panel position" group. Built
 *  when the menu opens, so each checked row reads the store as it is then. */
function layoutItems(): MenuItem[] {
  const appearance = appearanceSubmenu().children;
  const last = appearance.length - 1;
  return [...appearance.map((row, index) => (index === last ? { ...row, separatorAfter: true } : row)), ...workbenchPositionMenu()];
}

/** The title bar's Customize Layout button. It reuses the menubar's own machinery with one trigger
 *  (outside click, arrows, Home/End, Escape, focus back to the button), so there is no second
 *  popover mechanism to keep in step. Selecting a row runs it and closes the menu. */
export const CustomizeLayoutMenu: React.FC = () => {
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const nav = useMenuNavigation(boxRef, IDS);
  const focusReturn = useFocusReturn(boxRef, buttonRef);
  const open = nav.openId === MENU_ID;

  function handleSelect(item: MenuAction): void {
    nav.close();
    focusReturn.activate(item);
  }

  return (
    <div ref={boxRef} className="relative" onKeyDown={nav.onKeyDown} aria-keyshortcuts={nav.keyshortcuts} {...focusReturn.captureProps}>
      <button
        ref={buttonRef}
        type="button"
        data-menu-trigger
        data-testid="customize-layout"
        aria-label="Customize layout"
        title="Customize layout"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => nav.toggle(MENU_ID)}
        className={BUTTON}
      >
        <LayoutTemplate size={16} aria-hidden />
      </button>
      {open && <MenuDropdown items={layoutItems()} onSelect={handleSelect} align="right" subId={nav.subId} onSub={nav.setSub} />}
    </div>
  );
};
