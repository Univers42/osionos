/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AgentButton.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { useChatStore } from "@/features/chat/model/useChatStore";
import { cx } from "@osionos/ui/shared/classNames";
import { agentMenuItems, openAssistant } from "../model/agentMenu";
import type { MenuAction, MenuContext } from "../model/menuTypes";
import { MenuDropdown } from "./MenuDropdown";
import { useMenuNavigation } from "./useMenuNavigation";

const IDS = ["agents"] as const;
const PART = "inline-flex items-center justify-center text-[var(--osio-fg-muted)] transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]";

/**
 * The agent entry, right after the search bar: the main part opens the
 * assistant with the caret in its composer, the caret lists the agents to start
 * a chat with. Phone-sized (44px) below `sm`.
 */
export const AgentButton: React.FC<{ ctx: MenuContext }> = ({ ctx }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const nav = useMenuNavigation(boxRef, IDS);
  const agents = useChatStore((state) => state.agents);
  const open = nav.openId === IDS[0];

  useEffect(() => {
    if (open && agents.length === 0) void useChatStore.getState().loadAgents();
  }, [open, agents.length]);

  function handleSelect(item: MenuAction): void {
    nav.close();
    item.run();
  }

  return (
    <div ref={boxRef} className="relative shrink-0" aria-keyshortcuts={nav.keyshortcuts} onKeyDown={nav.onKeyDown}>
      <div className="inline-flex items-center rounded-[var(--osio-radius-chip)] border border-[var(--osio-border-default)]">
        <button
          type="button"
          aria-label="Ask an agent"
          title="Ask an agent"
          onClick={openAssistant}
          className={cx(PART, "h-11 min-w-11 gap-1.5 rounded-l-[var(--osio-radius-chip)] px-2 text-sm sm:h-7 sm:min-w-7")}
        >
          <Sparkles size={14} aria-hidden />
          <span className="hidden lg:inline" aria-hidden>Ask agent</span>
        </button>
        <button
          type="button"
          data-menu-trigger
          aria-label="Choose an agent"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => nav.toggle(IDS[0])}
          className={cx(PART, "h-11 w-8 rounded-r-[var(--osio-radius-chip)] border-l border-[var(--osio-border-default)] sm:h-7 sm:w-6")}
        >
          <ChevronDown size={14} aria-hidden />
        </button>
      </div>
      {open && <MenuDropdown items={agentMenuItems(agents, ctx)} onSelect={handleSelect} align="right" scroll />}
    </div>
  );
};
