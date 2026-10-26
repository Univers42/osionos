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

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, UsersRound } from "lucide-react";

import { Button, MenuItem } from "@/shared/ui";
import type { AgentSummary } from "@/features/ai/model/aiAgents";
import { scopeWords } from "@/features/ai/model/agentForm";
import { PANEL_MAX, PANEL_MIN, togglePanelMember } from "@/features/chat/model/agentPanel";
import { AgentAvatar } from "./AgentAvatar";
import { PopoverMenu } from "./PopoverMenu";

interface Props {
  agents: AgentSummary[];
  /** The agent of the next run, or none (the general assistant). */
  agentId: string | null;
  onChange?: (agentId: string | null) => void;
  /** The agents of the panel, in order; empty is no panel. */
  panel?: string[];
  onPanelChange?: (agentIds: string[]) => void;
}

export const AgentChip: React.FC<Props> = ({ agents, agentId, onChange, panel = [], onPanelChange }) => {
  const [open, setOpen] = useState(false);
  // The panel is picked in the same menu: a draft until "Use panel".
  const [draft, setDraft] = useState<string[] | null>(null);
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

  // Switching to the picker unmounts the row that had the focus: put it on the first row.
  const bodyRef = useRef<HTMLDivElement>(null);
  const picking = draft !== null;
  useEffect(() => {
    if (open && picking) bodyRef.current?.querySelector<HTMLElement>("[role^=menuitem]:not(:disabled)")?.focus({ preventScroll: true });
  }, [picking, open]);
  const close = () => { setOpen(false); setDraft(null); };
  const pickRow = (agent: AgentSummary) => {
    const picked = draft?.includes(agent.id) ?? false;
    const review = agent.kind === "custom" && agent.needsReview;
    return (
      <MenuItem
        key={agent.id}
        role="menuitemcheckbox"
        aria-checked={picked}
        disabled={review || (!picked && (draft?.length ?? 0) >= PANEL_MAX)}
        icon={<AgentAvatar agent={agent} size={20} />}
        onClick={() => setDraft((ids) => togglePanelMember(ids ?? [], agent.id))}
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate">{agent.name}</span>
          {picked ? <Check size={14} aria-hidden="true" className="ml-auto shrink-0 text-[var(--osio-accent)]" /> : null}
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
      <PopoverMenu anchorRef={anchorRef} open={open} onClose={close} label={draft ? "Panel" : "Agent"}>
        {draft ? (
          <div ref={bodyRef} className="w-[260px] max-w-[calc(100vw-4rem)] p-1">
            <div role="presentation" className="px-3 pb-1 pt-2 text-xs font-medium text-[var(--osio-fg-muted)]">Pick {PANEL_MIN} or {PANEL_MAX} agents, in the order they answer</div>
            {runnable.map((agent) => pickRow(agent))}
            <MenuItem
              role="menuitem"
              disabled={draft.length < PANEL_MIN}
              onClick={() => { onPanelChange?.(draft); close(); }}
            >
              Use panel
            </MenuItem>
          </div>
        ) : (
          <div ref={bodyRef} className="w-[260px] max-w-[calc(100vw-4rem)] p-1">
            {row(null)}
            {onPanelChange ? (
              <MenuItem role="menuitem" icon={<UsersRound size={16} aria-hidden="true" />} onClick={() => setDraft([...panel])}>
                Panel…
              </MenuItem>
            ) : null}
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
