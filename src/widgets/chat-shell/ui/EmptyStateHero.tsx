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

import React, { useState } from "react";
import { ChevronDown, FileText, History, LayoutTemplate, ListChecks, Network, PenLine, Search, Table, type LucideIcon } from "lucide-react";

import { ChatComposer } from "./ChatComposer";
import { ConnectorsStrip } from "./ConnectorsStrip";
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
  panel?: string[];
  onPanelChange?: (agentIds: string[]) => void;
  /** The workspace switch of the web tools is on. */
  webAvailable?: boolean;
  /** The service offers research mode. */
  researchAvailable?: boolean;
  /** The attached files — a block's "Ask AI" may have brought one. */
  attachments?: ComposerAttachment[];
  onAttachmentsChange?: (attachments: ComposerAttachment[]) => void;
  /** The reader's first name, for the greeting. */
  firstName?: string;
  /** Changes when the composer should take the focus back (a starter was picked). */
  focusSignal?: number;
}

/** The quick actions in the row: the first five starters, in group order. */
const QUICK_ACTIONS = STARTER_GROUPS.flatMap((group) => group.starters).slice(0, 5);

const QuickActions: React.FC<{ onPick: (text: string) => void }> = ({ onPick }) => {
  const [more, setMore] = useState(false);
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex flex-wrap items-center justify-center gap-1.5" data-testid="quick-actions">
        {QUICK_ACTIONS.map((starter) => {
          const Icon = STARTER_ICONS[starter.icon];
          return (
            <button
              key={starter.title}
              type="button"
              onClick={() => onPick(starter.prompt)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
            >
              <Icon size={15} aria-hidden="true" className="shrink-0" />
              {starter.title}
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((on) => !on)}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-[var(--osio-fg-muted)] transition-colors hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
        >
          More
          <ChevronDown size={14} aria-hidden="true" className={more ? "rotate-180" : undefined} />
        </button>
      </div>
      {more ? <StarterList onPick={onPick} /> : null}
    </div>
  );
};

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

/** A new chat: the mascot, one question, the lit composer, and a row of ways to start. */
export const EmptyStateHero: React.FC<Props> = ({
  value, onChange, onSubmit, onConnect, onPick, selection, onSelectionChange, chips, onChipsChange,
  agents = [], agentId = null, onAgentChange, panel, onPanelChange, attachments, onAttachmentsChange, firstName, focusSignal, webAvailable, researchAvailable,
}) => {
  const greeting = `${greetingFor(new Date().getHours())}${firstName ? `, ${firstName}` : ""}`;
  return (
    <div className="@container min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-7 px-4 py-10 @[720px]:py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <AssistantMascot size={60} followPointer typing={value.length > 0} />
          <div>
            <p className="text-sm text-[var(--osio-fg-muted)]">{greeting}</p>
            <h1 className="mt-1 font-[family-name:var(--osio-font-display)] text-3xl leading-[1.1] tracking-[-0.02em] text-[var(--osio-fg-strong)] @[640px]:text-4xl">
              How can I help you today?
            </h1>
          </div>
        </div>

        <div className="w-full max-w-[640px]">
          <BrainLens working={false} tray={<ConnectorsStrip />}>
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
              panel={panel}
              onPanelChange={onPanelChange}
              attachments={attachments}
              onAttachmentsChange={onAttachmentsChange}
              focusSignal={focusSignal}
              webAvailable={webAvailable}
              researchAvailable={researchAvailable}
              autoFocus
            />
          </BrainLens>
        </div>

        <QuickActions onPick={onPick} />
      </div>
    </div>
  );
};
