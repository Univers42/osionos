/** "Ask another agent" in the action row of an answer: the same question, asked of an agent that did not answer it. */

import React, { useRef, useState } from "react";
import { UsersRound } from "lucide-react";

import { MenuItem } from "@/shared/ui";
import type { AgentSummary } from "@/features/ai/model/aiAgents";
import { AgentAvatar } from "./AgentAvatar";
import { PopoverMenu } from "./PopoverMenu";

interface Props {
  /** The agents that may be asked: the author of the answer is already left out. */
  agents: AgentSummary[];
  disabled?: boolean;
  onPick: (agentId: string) => void;
}

const BUTTON =
  "inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] disabled:cursor-default disabled:opacity-50";

export const AskAnotherAgent: React.FC<Props> = ({ agents, disabled, onPick }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  if (agents.length === 0) return null;
  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        <button
          type="button"
          className={BUTTON}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((on) => !on)}
        >
          <UsersRound size={12} aria-hidden="true" />
          Ask another agent
        </button>
      </span>
      <PopoverMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} label="Ask another agent">
        <div className="w-[260px] max-w-[calc(100vw-4rem)] p-1">
          {agents.map((agent) => (
            <MenuItem
              key={agent.id}
              role="menuitem"
              icon={<AgentAvatar agent={agent} size={20} />}
              onClick={() => { setOpen(false); onPick(agent.id); }}
            >
              <span className="min-w-0 truncate">{agent.name}</span>
            </MenuItem>
          ))}
        </div>
      </PopoverMenu>
    </>
  );
};
