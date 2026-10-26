/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmptyStateHero.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { FileText, History, LayoutTemplate, ListChecks, Network, PenLine, Search, Table, type LucideIcon } from "lucide-react";

import { ChatComposer } from "./ChatComposer";
import { ConnectorsStrip } from "./ConnectorsStrip";
import { AgentAvatar } from "./AgentAvatar";
import { BrainLens } from "./BrainLens";
import { AssistantMascot } from "@/features/ai/ui/AssistantMascot";
import { greetingFor } from "@/shared/lib/date/greeting";
import { STARTER_GROUPS, type Starter } from "../model/brainHome";
import type { AiSelection } from "@/features/ai/model/aiSelection";
import type { ContextChip } from "@/features/ai/model/aiContext";
import type { AgentSummary } from "@/features/ai/model/aiAgents";
import type { ComposerAttachment } from "@/features/chat/model/assistantHandoff";

const STARTER_ICONS: Record<Starter["icon"], LucideIcon> = {
  "file-text": FileText,
  history: History,
  search: Search,
  "pen-line": PenLine,
  "list-checks": ListChecks,
  "layout-template": LayoutTemplate,
  network: Network,
  table: Table,
};

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onConnect: () => void;
  /** A starter was picked: its prompt goes into the composer, to be finished and sent. */
  onPick: (text: string) => void;
  selection: AiSelection;
  onSelectionChange: (selection: AiSelection) => void;
  /** The pages (and the workspace) the answer is read from. */
  chips: ContextChip[];
  onChipsChange: (chips: ContextChip[]) => void;
  /** The agents the service offers. */
  agents?: AgentSummary[];
  /** The agent of the next run, or none (the general assistant). */
  agentId?: string | null;
  /** The reader picked another agent. */
  onAgentChange?: (agentId: string | null) => void;
  /** The attached files — a block's "Ask AI" may have brought one. */
  attachments?: ComposerAttachment[];
  onAttachmentsChange?: (attachments: ComposerAttachment[]) => void;
  /** The reader's first name, for the greeting. */
  firstName?: string;
  /** Changes when the composer should take the focus back (a starter was picked). */
  focusSignal?: number;
}

const AgentChoice: React.FC<{ agent: AgentSummary | null; picked: boolean; onPick: () => void }> = ({ agent, picked, onPick }) => (
  <button
    type="button"
    onClick={onPick}
    aria-pressed={picked}
    disabled={agent?.kind === "custom" && agent.needsReview}
    className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
      picked
        ? "border-[var(--osio-accent)] bg-[var(--osio-accent-subtle)]"
        : "border-[var(--osio-border-soft)] hover:border-[var(--osio-border-default)] hover:bg-[var(--osio-bg-hover)]"
    }`}
  >
    <AgentAvatar agent={agent} size={30} />
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium text-[var(--osio-fg-default)]">{agent?.name ?? "General assistant"}</span>
      <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{agent?.description ?? "Your whole workspace, every tool"}</span>
    </span>
  </button>
);

const StarterList: React.FC<{ onPick: (text: string) => void }> = ({ onPick }) => (
  <div className="grid gap-x-6 gap-y-5 @[640px]:grid-cols-3">
    {STARTER_GROUPS.map((group) => (
      <section key={group.label} aria-label={group.label}>
        <h2 className="mb-1.5 font-sans text-xs font-medium text-[var(--osio-fg-subtle)]">{group.label}</h2>
        <ul className="flex flex-col">
          {group.starters.map((starter) => {
            const Icon = STARTER_ICONS[starter.icon];
            return (
              <li key={starter.title}>
                <button
                  type="button"
                  onClick={() => onPick(starter.prompt)}
                  className="group flex w-full items-center gap-2.5 rounded-md py-1.5 pr-2 text-left text-sm text-[var(--osio-fg-default)] transition-colors hover:text-[var(--osio-accent-text)]"
                >
                  <Icon size={15} aria-hidden="true" className="shrink-0 text-[var(--osio-fg-subtle)] group-hover:text-[var(--osio-accent)]" />
                  {starter.title}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </div>
);

/** A new chat: a greeting, the composer, who answers, and ways to start. */
export const EmptyStateHero: React.FC<Props> = ({
  value, onChange, onSubmit, onConnect, onPick, selection, onSelectionChange, chips, onChipsChange,
  agents = [], agentId = null, onAgentChange, attachments, onAttachmentsChange, firstName, focusSignal,
}) => {
  const greeting = `${greetingFor(new Date().getHours())}${firstName ? `, ${firstName}` : ""}`;
  const runnable = agents.filter((agent) => agent.kind !== "custom" || !agent.archived);
  return (
    <div className="@container min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-9 px-6 py-10 @[720px]:py-16">
        <div className="flex items-end gap-4">
          <AssistantMascot size={88} followPointer typing={value.length > 0} />
          <div className="min-w-0 pb-1">
            <h1 className="font-[family-name:var(--osio-font-display)] text-4xl leading-[1.05] tracking-[-0.02em] text-[var(--osio-fg-strong)] @[640px]:text-5xl">
              {greeting}
            </h1>
            <p className="mt-2 text-base text-[var(--osio-fg-muted)]">How can I help you today? Ask about your workspace, or hand the work to an agent.</p>
          </div>
        </div>

        <BrainLens working={false}>
          <ChatComposer
            value={value}
            onChange={onChange}
            onSubmit={onSubmit}
            onConnect={onConnect}
            selection={selection}
            onSelectionChange={onSelectionChange}
            chips={chips}
            onChipsChange={onChipsChange}
            agents={agents}
            agentId={agentId}
            onAgentChange={onAgentChange}
            attachments={attachments}
            onAttachmentsChange={onAttachmentsChange}
            focusSignal={focusSignal}
            autoFocus
          />
        </BrainLens>

        {runnable.length > 0 && onAgentChange ? (
          <section aria-label="Who answers">
            <h2 className="mb-2 font-sans text-xs font-medium text-[var(--osio-fg-subtle)]">Who answers</h2>
            <div className="grid gap-2 @[560px]:grid-cols-2 @[880px]:grid-cols-3">
              <AgentChoice agent={null} picked={agentId === null} onPick={() => onAgentChange(null)} />
              {runnable.map((agent) => (
                <AgentChoice key={agent.id} agent={agent} picked={agentId === agent.id} onPick={() => onAgentChange(agent.id)} />
              ))}
            </div>
          </section>
        ) : null}

        <StarterList onPick={onPick} />

        <ConnectorsStrip />
      </div>
    </div>
  );
};
