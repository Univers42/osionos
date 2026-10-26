import React, { useId, useState } from "react";
import { BookOpen, CircleCheck, CircleX, FileText, Layers, LoaderCircle, X } from "lucide-react";

import type { ContextChip } from "@/features/ai/model/aiContext";
import type { AiSelection } from "@/features/ai/model/aiSelection";
import { openAiHub } from "@/features/ai/model/aiHubNav";
import { outgoingContext, type OutgoingRow } from "@/features/ai/model/outgoingContext";
import { useAccountContext } from "@/features/settings/ai/AccountContextToggle";
import { openCitation } from "@/features/chat/model/openCitation";
import { toolActivityLine } from "@/features/chat/model/toolActivityLine";
import type { TrailActivity, TrailSource } from "../model/conversationTrail";

type Tab = "context" | "sources" | "activity";

interface Props {
  chips: readonly ContextChip[];
  selection: AiSelection;
  sources: readonly TrailSource[];
  activities: readonly TrailActivity[];
  onClose: () => void;
}

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-1 py-6 text-center text-sm text-[var(--osio-fg-subtle)]">{children}</p>
);

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2 mt-1 font-sans text-xs font-medium text-[var(--osio-fg-subtle)]">{children}</h3>
);

function sentWord(row: OutgoingRow): string {
  if (!row.sent) return "Not sent";
  return row.conditional ? "When used" : "Sent";
}

const ContextTab: React.FC<{ chips: readonly ContextChip[]; selection: AiSelection }> = ({ chips, selection }) => {
  const [accountContext] = useAccountContext();
  return (
    <div className="flex flex-col gap-5">
      <section>
        <Heading>This chat reads</Heading>
        {chips.length === 0 ? (
          <p className="text-sm text-[var(--osio-fg-muted)]">
            Your workspace, searched when a question needs it. Type <kbd className="rounded-xs border border-[var(--osio-border-default)] px-1 text-xs">@</kbd> in your message to add a page.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {chips.map((chip) => (
              <li key={chip.id} className="flex items-center gap-2 text-sm text-[var(--osio-fg-default)]">
                {chip.kind === "workspace" ? <Layers size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
                <span className="truncate">{chip.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <Heading>Sent with your next message</Heading>
        <ul className="flex flex-col divide-y divide-[var(--osio-border-soft)]">
          {outgoingContext({ accountContext, selection }).map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 py-2" title={row.detail}>
              <span className="text-sm text-[var(--osio-fg-default)]">{row.label}</span>
              <span className={`shrink-0 text-xs ${row.sent ? "text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-subtle)]"}`}>{sentWord(row)}</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => openAiHub("privacy")} className="mt-2 text-xs text-[var(--osio-accent-text)] hover:underline">
          Privacy settings
        </button>
      </section>
    </div>
  );
};

const SourcesTab: React.FC<{ sources: readonly TrailSource[] }> = ({ sources }) => {
  if (sources.length === 0) return <Empty>Pages the answers cite are listed here.</Empty>;
  return (
    <ul className="flex flex-col gap-1.5">
      {sources.map((source) => {
        const { citation } = source;
        const isPack = citation.collection === "pack";
        return (
          <li key={source.key}>
            <button
              type="button"
              onClick={() => openCitation(citation)}
              className="flex w-full flex-col gap-1 rounded-lg border border-[var(--osio-border-soft)] bg-[var(--osio-bg-surface)] px-3 py-2 text-left transition-colors hover:border-[var(--osio-border-default)] hover:bg-[var(--osio-bg-hover)]"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--osio-fg-default)]">
                {isPack ? <BookOpen size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
                <span className="truncate">{citation.title || "Untitled"}</span>
              </span>
              {citation.snippet ? <span className="line-clamp-2 text-xs text-[var(--osio-fg-muted)]">{citation.snippet}</span> : null}
              <span className="text-2xs text-[var(--osio-fg-subtle)]">
                {isPack ? "From a knowledge pack, cited in " : "Cited in "}
                {source.answers === 1 ? "1 answer" : `${source.answers} answers`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  if (status === "running") return <LoaderCircle size={14} aria-label="Running" className="animate-spin text-[var(--osio-accent)] motion-reduce:animate-none" />;
  if (status === "failed") return <CircleX size={14} aria-label="Failed" className="text-[var(--osio-danger)]" />;
  return <CircleCheck size={14} aria-label="Done" className="text-[var(--osio-fg-subtle)]" />;
};

const ActivityTab: React.FC<{ activities: readonly TrailActivity[] }> = ({ activities }) => {
  if (activities.length === 0) return <Empty>Searches, page reads and edits the assistant makes are listed here.</Empty>;
  return (
    <ol className="flex flex-col">
      {activities.map(({ messageId, activity }) => (
        <li key={`${messageId}:${activity.toolCallId}`} className="flex items-start gap-2.5 border-l border-[var(--osio-border-default)] py-1.5 pl-3 text-sm text-[var(--osio-fg-default)]">
          <span className="mt-0.5 shrink-0"><StatusIcon status={activity.status} /></span>
          <span className="min-w-0">
            {toolActivityLine(activity).map((piece, index) =>
              piece.kind === "label" ? <strong key={index} className="font-medium">{piece.text}</strong> : <span key={index}>{piece.text}</span>,
            )}
          </span>
        </li>
      ))}
    </ol>
  );
};

/** The right panel: what the chat reads and sends, the sources it cited, and what it did. */
export const BrainContextPanel: React.FC<Props> = ({ chips, selection, sources, activities, onClose }) => {
  const [tab, setTab] = useState<Tab>("context");
  const baseId = useId();
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    { id: "context", label: "Context" },
    { id: "sources", label: "Sources", count: sources.length },
    { id: "activity", label: "Activity", count: activities.length },
  ];
  return (
    <aside aria-label="Chat context" className="flex h-full w-80 shrink-0 flex-col border-l border-[var(--osio-border-soft)] bg-[var(--osio-bg-panel)]">
      <div className="flex items-center gap-1 border-b border-[var(--osio-border-soft)] px-2 py-1.5">
        <div role="tablist" aria-label="Chat context" className="flex flex-1 gap-0.5">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`${baseId}-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls={`${baseId}-panel`}
              onClick={() => setTab(entry.id)}
              className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                tab === entry.id ? "bg-[var(--osio-bg-hover)] font-medium text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
              }`}
            >
              {entry.label}
              {entry.count ? <span className="ml-1.5 text-xs text-[var(--osio-fg-subtle)]">{entry.count}</span> : null}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label="Close the context panel" className="rounded-md p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]">
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "context" ? <ContextTab chips={chips} selection={selection} /> : null}
        {tab === "sources" ? <SourcesTab sources={sources} /> : null}
        {tab === "activity" ? <ActivityTab activities={activities} /> : null}
      </div>
    </aside>
  );
};
