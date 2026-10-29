import React from "react";

import type { AgentSummary } from "@/features/ai/model/aiAgents";
import { BinocleMascot } from "@/shared/ui/mascot/BinocleMascot";
import type { BinocleMood } from "@/shared/ui/mascot/BinocleMascot";
import { agentInitials, agentTint } from "../model/brainHome";

interface Props {
  /** None: the general assistant, drawn as the mascot. */
  agent: AgentSummary | null;
  size?: number;
  /** The general assistant's mood; an agent's avatar shows its initials whatever the run does. */
  mood?: BinocleMood;
}

/** Who answers: the binocle for the general assistant, a tinted monogram for an agent. */
export const AgentAvatar: React.FC<Props> = ({ agent, size = 28, mood = "curious" }) => {
  const box = { width: size, height: size };
  if (!agent) {
    return (
      <span aria-hidden="true" style={box} className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-bg-subtle)]">
        <BinocleMascot mood={mood} size={Math.round(size * 0.86)} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...box, ...agentTint(agent.id), fontSize: Math.max(9, Math.round(size * 0.38)) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none"
    >
      {agentInitials(agent.name)}
    </span>
  );
};
