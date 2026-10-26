/** The hand-off an answer offers: another agent may take the question. It asks nothing until the button is pressed. */

import React from "react";
import { ArrowRight } from "lucide-react";

import type { AgentSummary } from "@/features/ai/model/aiAgents";
import { AgentAvatar } from "./AgentAvatar";

interface Props {
  agent: AgentSummary;
  /** Why the assistant thinks the agent fits: plain text. */
  reason: string;
  disabled?: boolean;
  onAsk: () => void;
}

export const AgentHandoffChip: React.FC<Props> = ({ agent, reason, disabled, onAsk }) => (
  <div
    data-testid="agent-handoff"
    className="mt-2 flex items-center gap-2.5 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-muted)] p-2.5 text-xs"
  >
    <AgentAvatar agent={agent} size={24} />
    <div className="min-w-0 flex-1">
      <div className="font-medium text-[var(--osio-fg-default)]">{agent.name} can take this</div>
      <div className="text-[var(--osio-fg-muted)]">{reason}</div>
    </div>
    <button
      type="button"
      disabled={disabled}
      onClick={onAsk}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-medium text-[var(--osio-accent)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      Ask {agent.name}
      <ArrowRight size={12} aria-hidden="true" />
    </button>
  </div>
);
