import React from "react";
import { PanelLeft, PanelRight, SquarePen } from "lucide-react";

import type { AgentSummary } from "@/features/ai/model/aiAgents";
import { AgentAvatar } from "./AgentAvatar";

interface Props {
  title: string;
  agent: AgentSummary | null;
  railOpen: boolean;
  onToggleRail: () => void;
  panelOpen: boolean;
  onTogglePanel: () => void;
  /** Sources plus tool calls so far: shown on the panel button while the panel is shut. */
  trailCount: number;
  onNew: () => void;
}

const iconButton =
  "inline-flex items-center gap-1.5 rounded-md p-1.5 text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] aria-pressed:text-[var(--osio-fg-default)]";

/** The bar over the chat: the rails, the title of the conversation and who answers in it. */
export const BrainHeader: React.FC<Props> = ({ title, agent, railOpen, onToggleRail, panelOpen, onTogglePanel, trailCount, onNew }) => (
  <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--osio-border-soft)] px-2">
    <button type="button" onClick={onToggleRail} aria-pressed={railOpen} aria-label={railOpen ? "Hide chats" : "Show chats"} className={iconButton}>
      <PanelLeft size={16} aria-hidden="true" />
    </button>
    {railOpen ? null : (
      <button type="button" onClick={onNew} aria-label="New chat" className={iconButton}>
        <SquarePen size={16} aria-hidden="true" />
      </button>
    )}
    <h2 className="min-w-0 flex-1 truncate font-sans text-sm font-medium text-[var(--osio-fg-default)]">{title}</h2>
    <span className="hidden items-center gap-1.5 rounded-full border border-[var(--osio-border-soft)] py-0.5 pl-0.5 pr-2.5 text-xs text-[var(--osio-fg-muted)] @[560px]:inline-flex">
      <AgentAvatar agent={agent} size={20} />
      {agent?.name ?? "General assistant"}
    </span>
    <button type="button" onClick={onTogglePanel} aria-pressed={panelOpen} aria-label={panelOpen ? "Hide context" : "Show context"} className={iconButton}>
      <PanelRight size={16} aria-hidden="true" />
      {!panelOpen && trailCount > 0 ? <span className="text-xs tabular-nums">{trailCount}</span> : null}
    </button>
  </header>
);
