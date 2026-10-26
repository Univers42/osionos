/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AgentChip.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+       */
/*                                                +#+#+#+#+#+   +#+           */
/*    Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#            */
/*    Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr      */
/*                                                                            */
/* ************************************************************************** */

/** The agent of the next run, as a chip in the composer: it shows who answers and opens the list. */

import React, { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { Button, MenuItem } from "@/shared/ui";
import type { AgentSummary } from "@/features/ai/model/aiAgents";
import { scopeWords } from "@/features/ai/model/agentForm";
import { AgentAvatar } from "./AgentAvatar";
import { PopoverMenu } from "./PopoverMenu";

interface Props {
  agents: AgentSummary[];
  /** The agent of the next run, or none (the general assistant). */
  agentId: string | null;
  onChange?: (agentId: string | null) => void;
}

export const AgentChip: React.FC<Props> = ({ agents, agentId, onChange }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const runnable = agents.filter((agent) => agent.kind !== "custom" || !agent.archived);
  const current = runnable.find((agent) => agent.id === agentId) ?? null;

  const row = (agent: AgentSummary | null) => {
    const id = agent?.id ?? null;
    const review = agent?.kind === "custom" && agent.needsReview;
    const detail = agent?.kind === "custom" ? ` · ${scopeWords(agent.scope)}${review ? " · needs review" : ""}` : "";
    return (
      <MenuItem
        key={id ?? "general"}
        role="menuitemradio"
        aria-checked={id === (current?.id ?? null)}
        disabled={review}
        icon={<AgentAvatar agent={agent} size={20} />}
        onClick={() => { onChange?.(id); setOpen(false); }}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate">{(agent?.name ?? "General assistant") + detail}</span>
          {id === (current?.id ?? null) ? <Check size={14} aria-hidden="true" className="ml-auto shrink-0 text-[var(--osio-accent)]" /> : null}
        </span>
      </MenuItem>
    );
  };

  const builtIns = runnable.filter((agent) => agent.kind !== "custom");
  const custom = runnable.filter((agent) => agent.kind === "custom");
  return (
    <>
      <span ref={anchorRef} className="inline-flex" data-testid="ai-agent-picker">
        <Button
          tone="ghost"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Agent: ${current?.name ?? "General assistant"}`}
          onClick={() => setOpen((on) => !on)}
          className="max-w-44 gap-1.5 rounded-full px-2 text-xs"
        >
          <AgentAvatar agent={current} size={18} />
          <span className="truncate">{current?.name ?? "General assistant"}</span>
          <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
        </Button>
      </span>
      <PopoverMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} label="Agent">
        {(
          <div className="w-[260px] max-w-[calc(100vw-4rem)] p-1">
            {row(null)}
            {builtIns.map((agent) => row(agent))}
            {custom.length > 0 ? (
              <>
                <div role="presentation" className="px-3 pb-1 pt-2 text-xs font-medium text-[var(--osio-fg-muted)]">Your agents</div>
                {custom.map((agent) => row(agent))}
              </>
            ) : null}
          </div>
        )}
      </PopoverMenu>
    </>
  );
};
