/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ComposerPlus.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+       */
/*                                                +#+#+#+#+#+   +#+           */
/*    Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#            */
/*    Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr      */
/*                                                                            */
/* ************************************************************************** */

/** The composer's "+": attach a file, point the answer at a page, connect a model. */

import React, { useRef, useState } from "react";
import { AtSign, Paperclip, Plug, Plus } from "lucide-react";

import { IconButton, MenuItem } from "@/shared/ui";
import { PopoverMenu } from "./PopoverMenu";

interface Props {
  onAttach: () => void;
  onMention: () => void;
  onConnect: () => void;
}

export const ComposerPlus: React.FC<Props> = ({ onAttach, onMention, onConnect }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const item = (label: string, icon: React.ReactNode, run: () => void) => (
    <MenuItem role="menuitem" icon={icon} onClick={() => { setOpen(false); run(); }}>{label}</MenuItem>
  );
  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        <IconButton label="Add to the message" size="md" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((on) => !on)}>
          <Plus size={18} aria-hidden="true" />
        </IconButton>
      </span>
      <PopoverMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} label="Add to the message">
        {(
          <div className="w-[240px] max-w-[calc(100vw-4rem)] p-1">
            {item("Attach a file", <Paperclip size={16} aria-hidden="true" />, onAttach)}
            {item("Reference a page", <AtSign size={16} aria-hidden="true" />, onMention)}
            {item("Connect a model", <Plug size={16} aria-hidden="true" />, onConnect)}
          </div>
        )}
      </PopoverMenu>
    </>
  );
};
