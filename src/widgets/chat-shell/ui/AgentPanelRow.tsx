/** The panel while it is active: the avatars of its agents, in order, and one click clears it. */

import React from "react";
import { X } from "lucide-react";

import type { AgentSummary } from "@/features/ai/model/aiAgents";
import { AgentAvatar } from "./AgentAvatar";

interface Props {
  members: AgentSummary[];
  onClear: () => void;
}

export const AgentPanelRow: React.FC<Props> = ({ members, onClear }) => (
  <span
    data-testid="agent-panel-row"
    className="inline-flex items-center gap-1 rounded-full border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] py-0.5 pl-1.5 pr-0.5 text-xs text-[var(--osio-fg-muted)]"
  >
    Panel
    <span className="flex -space-x-1" title={members.map((member) => member.name).join(", ")}>
      {members.map((member) => <AgentAvatar key={member.id} agent={member} size={18} />)}
    </span>
    <button
      type="button"
      aria-label="Clear panel"
      onClick={onClear}
      className="inline-flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
    >
      <X size={12} aria-hidden="true" />
    </button>
  </span>
);
