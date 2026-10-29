import React, { useMemo, useState } from "react";
import { Search, Settings2, SquarePen } from "lucide-react";

import type { AgentSummary } from "@/features/ai/model/aiAgents";
import type { Conversation } from "@/features/chat/model/chatTypes";
import { ConversationRow } from "@/features/chat/ui/ConversationRow";
import { openAiHub } from "@/features/ai/model/aiHubNav";
import { groupConversations } from "../model/brainHome";
import { AgentAvatar } from "./AgentAvatar";

interface Props {
  conversations: readonly Conversation[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  agents: readonly AgentSummary[];
  agentId: string | null;
  onPickAgent: (agentId: string | null) => void;
}

const rowClass = (current: boolean) =>
  `block w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
    current
      ? "bg-[var(--osio-bg-hover)] font-medium text-[var(--osio-fg-default)]"
      : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
  }`;

const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between px-2.5 pb-1 pt-4">
    <h3 className="font-sans text-xs font-medium text-[var(--osio-fg-subtle)]">{children}</h3>
    {action}
  </div>
);

const AgentRow: React.FC<{ agent: AgentSummary | null; picked: boolean; onPick: () => void }> = ({ agent, picked, onPick }) => {
  const blocked = agent?.kind === "custom" && agent.needsReview;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={blocked}
      aria-pressed={picked}
      title={blocked ? "Needs a workspace admin's review before it can run" : agent?.description ?? "Answers from your workspace with every tool"}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors disabled:opacity-50 ${
        picked ? "bg-[var(--osio-accent-subtle)] text-[var(--osio-accent-text)]" : "text-[var(--osio-fg-default)] hover:bg-[var(--osio-bg-hover)]"
      }`}
    >
      <AgentAvatar agent={agent} size={22} />
      <span className="min-w-0 flex-1 truncate">{agent?.name ?? "General assistant"}</span>
      {agent?.kind === "custom" ? (
        <span className="shrink-0 text-2xs text-[var(--osio-fg-subtle)]">{agent.scope === "workspace" ? "Team" : "Yours"}</span>
      ) : null}
    </button>
  );
};

/** The left rail of the assistant: start a chat, pick who answers, find an old conversation. */
export const BrainRail: React.FC<Props> = ({ conversations, activeId, onOpen, onNew, agents, agentId, onPickAgent }) => {
  const [query, setQuery] = useState("");
  const visibleAgents = agents.filter((agent) => agent.kind !== "custom" || !agent.archived);
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle ? conversations.filter((c) => c.title.toLowerCase().includes(needle)) : conversations;
    return groupConversations(matching, new Date());
  }, [conversations, query]);

  return (
    <aside aria-label="Assistant navigation" className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--osio-border-soft)] bg-[var(--osio-bg-panel)]">
      <div className="flex flex-col gap-2 p-3 pb-1">
        <button
          type="button"
          onClick={onNew}
          className="flex items-center justify-center gap-2 rounded-lg bg-[var(--osio-accent)] px-3 py-2 text-sm font-medium text-[var(--osio-accent-fg)] shadow-osio-e1 transition-colors hover:bg-[var(--osio-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--osio-focus-ring-color)]"
        >
          <SquarePen size={15} aria-hidden="true" /> New chat
        </button>
        <label className="flex items-center gap-2 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1.5 focus-within:border-[var(--osio-field-border-focus)]">
          <Search size={14} aria-hidden="true" className="shrink-0 text-[var(--osio-fg-subtle)]" />
          <span className="sr-only">Search chats</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        <SectionTitle
          action={
            <button type="button" onClick={() => openAiHub("agents")} className="rounded-xs px-1 text-2xs text-[var(--osio-fg-subtle)] hover:text-[var(--osio-fg-default)]">
              Manage
            </button>
          }
        >
          Who answers
        </SectionTitle>
        <div role="group" aria-label="Who answers" className="flex flex-col gap-0.5">
          <AgentRow agent={null} picked={agentId === null} onPick={() => onPickAgent(null)} />
          {visibleAgents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} picked={agentId === agent.id} onPick={() => onPickAgent(agent.id)} />
          ))}
        </div>

        <nav aria-label="Chat history">
          {groups.length === 0 ? (
            <p className="px-2.5 pt-4 text-xs text-[var(--osio-fg-subtle)]">{query ? "No chat matches that search." : "Your chats will be listed here."}</p>
          ) : (
            groups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <SectionTitle>{group.label}</SectionTitle>
                {group.conversations.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    isCurrent={c.id === activeId}
                    onOpen={() => onOpen(c.id)}
                    openClassName={rowClass(c.id === activeId)}
                  >
                    {c.title}
                  </ConversationRow>
                ))}
              </section>
            ))
          )}
        </nav>
      </div>

      <div className="border-t border-[var(--osio-border-soft)] p-1.5">
        <button
          type="button"
          onClick={() => openAiHub("overview")}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        >
          <Settings2 size={15} aria-hidden="true" /> AI Hub
        </button>
      </div>
    </aside>
  );
};
