/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PopoverMenu.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+       */
/*                                                +#+#+#+#+#+   +#+           */
/*    Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#            */
/*    Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr      */
/*                                                                            */
/* ************************************************************************** */

/**
 * A popover menu that the keyboard drives: it takes the focus when it opens,
 * the arrows (Home, End) move between its rows, Escape closes it, and the focus
 * goes back to the button it hangs from. The composer's "+" and the agent chip
 * are both this.
 *
 * Caveat: the focus goes back only when nothing else has it by then; a click
 * outside onto another field leaves the focus on that field.
 */

import React, { useEffect, useRef } from "react";

import { Menu, Popover } from "@/shared/ui";

interface Props {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  label: string;
  align?: "start" | "end";
  children: React.ReactNode;
}

const ROWS = "[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox]";

export const PopoverMenu: React.FC<Props> = ({ anchorRef, open, onClose, label, align = "start", children }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  const enabledRows = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>(ROWS) ?? []).filter((row) => !row.disabled);

  useEffect(() => {
    if (open) {
      const rows = enabledRows();
      (rows.find((row) => row.getAttribute("aria-checked") === "true") ?? rows[0])?.focus({ preventScroll: true });
    } else if (wasOpen.current && (document.activeElement === document.body || !document.activeElement)) {
      anchorRef.current?.querySelector("button")?.focus();
    }
    wasOpen.current = open;
  }, [open, anchorRef]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const rows = enabledRows();
    const index = rows.indexOf(event.target as HTMLButtonElement);
    const to = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: rows.length - 1 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    rows[(to + rows.length) % rows.length]?.focus({ preventScroll: true });
  };

  return (
    <Popover anchorRef={anchorRef} open={open} align={align} onClose={onClose}>
      <Menu ref={menuRef} aria-label={label} onKeyDown={onKeyDown} className="border-0 p-0 shadow-none">
        {children}
      </Menu>
    </Popover>
  );
};
