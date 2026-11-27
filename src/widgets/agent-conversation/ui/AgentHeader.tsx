/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AgentHeader.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React from "react";
import { FilePlus2, RotateCcw } from "lucide-react";

import { AssistantAvatar } from "@/shared/ui/mascot/AssistantAvatar";
import { Tooltip } from "@/shared/ui";

import { GHOST_ICON_BUTTON_CLASS, PILL_CLASS } from "./agentClasses";

interface AgentHeaderProps {
  title: string;
  subtitle: string;
  canOpenCreatedPage: boolean;
  onOpenCreatedPage: () => void;
  onReset: () => void;
}

/** The page title, what the conversation holds, and its two actions. */
export const AgentHeader: React.FC<AgentHeaderProps> = ({ title, subtitle, canOpenCreatedPage, onOpenCreatedPage, onReset }) => (
  <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--osio-border-soft)] px-5">
    <div className="flex min-w-0 items-center gap-3">
      <AssistantAvatar size={28} />
      <div className="min-w-0">
        <h1 className="truncate text-sm font-semibold leading-5">{title}</h1>
        <p className="truncate text-xs text-[var(--osio-fg-muted)]">{subtitle}</p>
      </div>
    </div>
    <div className="flex items-center gap-1">
      {canOpenCreatedPage ? (
        <button type="button" onClick={onOpenCreatedPage} className={`${PILL_CLASS} font-medium`}>
          <FilePlus2 size={14} aria-hidden="true" />
          Open page
        </button>
      ) : null}
      <Tooltip label="Reset conversation">
        <button type="button" onClick={onReset} className={GHOST_ICON_BUTTON_CLASS} aria-label="Reset conversation">
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  </header>
);
