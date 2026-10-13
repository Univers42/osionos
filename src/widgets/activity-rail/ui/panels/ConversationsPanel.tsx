/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConversationsPanel.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 06:40:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 06:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Every conversation in one place: AI chats and agents, workspace channels,
// direct messages. One filter box narrows all of them; the chips show one kind.
// Channels and DMs keep their own create buttons; AI chats get theirs here.

import React, { useMemo, useState } from "react";
import { Bot, MessageSquarePlus, Search, Sparkles } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";

import type { PageEntry } from "@/entities/page";
import { useUserStore } from "@/features/auth";
import { useChatStore } from "@/features/chat/model/useChatStore";
import { matchingByName } from "@/shared/lib/text/matchingByName";
import { usePageStore } from "@/store/usePageStore";
import { ChannelList } from "@/widgets/channel-list";
import { DmList } from "@/widgets/dm-list";
import { chatTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

type Kind = "all" | "people" | "channels" | "ai";

const KINDS: readonly { id: Kind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "people", label: "People" },
  { id: "channels", label: "Channels" },
  { id: "ai", label: "AI" },
];

const NO_PAGES: readonly PageEntry[] = [];
const RECENT_AI_CHATS = 8;

function openAiChat(conversationId: string): void {
  useChatStore.getState().setActive(conversationId);
  useWorkspaceLayout.getState().openTab(chatTab());
}

function startAiChat(): void {
  const conversation = useChatStore.getState().createConversation();
  openAiChat(conversation.id);
}

const rowClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--osio-focus-ring-color)]";

const AiSection: React.FC<{ filter: string }> = ({ filter }) => {
  const conversations = useChatStore(useShallow((s) => [...s.conversations]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT_AI_CHATS)));
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const pages = usePageStore((s) => s.pages[workspaceId] ?? NO_PAGES);
  const agents = useMemo(() => pages.filter((p) => p.surface === "agent" && !p.archivedAt && !p.parentPageId), [pages]);
  const chats = matchingByName(conversations.map((c) => ({ ...c, name: c.title })), filter);
  const shownAgents = matchingByName(agents.map((a) => ({ ...a, name: a.title })), filter);

  return (
    <section className="px-2 py-1" aria-label="AI">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase text-[var(--osio-fg-subtle)]">AI</h2>
        <button type="button" aria-label="New AI chat" title="New AI chat" onClick={startAiChat}
          className="rounded p-1 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]">
          <MessageSquarePlus size={14} />
        </button>
      </div>
      <ul className="mt-1 space-y-0.5">
        {chats.map((chat) => (
          <li key={chat.id}>
            <button type="button" className={rowClass} onClick={() => openAiChat(chat.id)}>
              <Sparkles size={14} className="shrink-0" aria-hidden />
              <span className="truncate">{chat.title || "New chat"}</span>
            </button>
          </li>
        ))}
        {shownAgents.map((agent) => (
          <li key={agent._id}>
            <button type="button" className={rowClass}
              onClick={() => usePageStore.getState().openPage({ id: agent._id, workspaceId, kind: "page", title: agent.title, icon: agent.icon })}>
              {agent.icon ? <IconValueView value={agent.icon} size={14} className="shrink-0" /> : <Bot size={14} className="shrink-0" aria-hidden />}
              <span className="truncate">{agent.title || "Untitled agent"}</span>
            </button>
          </li>
        ))}
        {chats.length === 0 && shownAgents.length === 0 ? (
          <li className="px-2 py-1 text-xs text-[var(--osio-fg-subtle)]">
            {filter ? "No AI chat matches." : "No AI chats yet. Use + to start one."}
          </li>
        ) : null}
      </ul>
    </section>
  );
};

export const ConversationsPanel: React.FC = () => {
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const show = (section: Kind) => kind === "all" || kind === section;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 px-3 pb-2">
        <label className="flex h-8 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 text-[var(--osio-fg-muted)] focus-within:ring-2 focus-within:ring-[var(--osio-focus-ring-color)]">
          <Search size={14} aria-hidden />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape" && filter) { event.preventDefault(); setFilter(""); } }}
            aria-label="Filter conversations"
            placeholder="Filter conversations"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]"
          />
        </label>
        <div role="radiogroup" aria-label="Show" className="flex gap-1">
          {KINDS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={kind === id}
              onClick={() => setKind(id)}
              className={[
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]",
                kind === id
                  ? "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]"
                  : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <nav aria-label="Conversations" className="flex-1 overflow-y-auto overflow-x-hidden pb-5">
        {show("ai") ? <AiSection filter={filter} /> : null}
        {show("channels") ? <ChannelList filter={filter} /> : null}
        {show("people") ? <DmList filter={filter} /> : null}
      </nav>
    </div>
  );
};
