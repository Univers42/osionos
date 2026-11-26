/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DockPositionMenu.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Check, PanelBottom, PanelLeft, PanelRight, type LucideIcon } from "lucide-react";

import { useMediaQuery } from "@/shared/config/useMediaQuery";
import { PHONE_QUERY } from "@/shared/config/useResponsiveSidebar";
import { MenuItem, PopoverMenu, Tooltip } from "@/shared/ui";
import { DOCK_POSITIONS, type DockPosition } from "@/widgets/workbench/model/workbenchLayout";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";
import { ICON_BTN } from "./dockIconButton";

const OPTION: Readonly<Record<DockPosition, { label: string; Icon: LucideIcon }>> = Object.freeze({
  bottom: { label: "Bottom", Icon: PanelBottom },
  left: { label: "Left", Icon: PanelLeft },
  right: { label: "Right", Icon: PanelRight },
});

/** The dock header's "Panel position" button: a menu of Bottom, Left and Right where the chosen
 *  row is the dock's current place. It is not drawn on a phone, where the dock is always at the
 *  bottom, so the stored choice is neither shown nor changed there. */
export const DockPositionMenu: React.FC = () => {
  const position = useWorkbenchStore((s) => s.dockPosition);
  const setPosition = useWorkbenchStore((s) => s.setDockPosition);
  const phone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  if (phone) return null;
  const { Icon } = OPTION[position];

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        <Tooltip label="Panel position" side="bottom">
          <button
            type="button"
            aria-label="Panel position"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((on) => !on)}
            className={ICON_BTN}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      </span>
      <PopoverMenu anchorRef={anchorRef} open={open} onClose={close} label="Panel position" align="end">
        <div className="w-[160px] p-1">
          {DOCK_POSITIONS.map((id) => {
            const { label, Icon: RowIcon } = OPTION[id];
            return (
              <MenuItem
                key={id}
                role="menuitemradio"
                aria-checked={id === position}
                icon={<RowIcon size={16} aria-hidden="true" />}
                onClick={() => {
                  setPosition(id);
                  close();
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  {label}
                  {id === position ? <Check size={14} aria-hidden="true" /> : null}
                </span>
              </MenuItem>
            );
          })}
        </div>
      </PopoverMenu>
    </>
  );
};
