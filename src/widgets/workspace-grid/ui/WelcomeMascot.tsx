/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WelcomeMascot.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Binocle on the empty workspace: a button that opens a menu of ways to start.

import React from "react";

import { BinocleMascot } from "@/shared/ui/mascot/BinocleMascot";
import { MenuItem, PopoverMenu } from "@/shared/ui";

import { START_ACTIONS } from "../model/welcomeActions";

const MENU_ACTIONS = START_ACTIONS.filter((action) => action.inMenu);

/** The clickable mascot: curious at rest, happy on hover or keyboard focus,
 *  listening while its menu is open. Each row closes the menu, then runs. */
export const WelcomeMascot: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [engaged, setEngaged] = React.useState(false);
  const anchorRef = React.useRef<HTMLSpanElement>(null);
  const close = React.useCallback(() => setOpen(false), []);
  const mood = open ? "listening" : engaged ? "happy" : "curious";
  const onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    if (event.currentTarget.matches(":focus-visible")) setEngaged(true);
  };

  return (
    <>
      <span ref={anchorRef} className="inline-flex shrink-0">
        <button
          type="button"
          aria-label="Binocle, open quick actions"
          aria-haspopup="menu"
          aria-expanded={open}
          className="osio-welcome-mascot"
          onClick={() => setOpen((on) => !on)}
          onPointerEnter={() => setEngaged(true)}
          onPointerLeave={() => setEngaged(false)}
          onFocus={onFocus}
          onBlur={() => setEngaged(false)}
        >
          <BinocleMascot size={112} mood={mood} />
        </button>
      </span>
      <PopoverMenu anchorRef={anchorRef} open={open} onClose={close} label="Binocle" align="start">
        <div className="w-[200px] p-1">
          {MENU_ACTIONS.map(({ id, label, Icon, run }) => (
            <MenuItem
              key={id}
              icon={<Icon size={16} aria-hidden />}
              onClick={() => {
                close();
                run();
              }}
            >
              {label}
            </MenuItem>
          ))}
        </div>
      </PopoverMenu>
    </>
  );
};
