/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AssistantPanel.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The sidebar's Assistant panel: what used to be the two columns beside the chat
// (docs/feature-placement.md rule 4). The chat tab keeps only the conversation;
// who answers and the pages it reads are the shared draft both of them change.

import React, { useEffect, useMemo } from "react";
import { Settings2 } from "lucide-react";

import { useUserStore } from "@/features/auth";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { openAiHub } from "@/features/ai/model/aiHubNav";
import { useAssistantDraft } from "@/features/chat/model/assistantDraft";
import { openAiChat, startAiChat } from "@/features/chat/model/openAssistantWith";
import { conversationsOf, isUntouchedConversation, useChatStore } from "@/features/chat/model/useChatStore";
import { activitiesOf, sourcesOf } from "../model/conversationTrail";
import { AssistantChats } from "./AssistantChats";
import { ChatContextTabs } from "./ChatContextTabs";

export const AssistantPanel: React.FC = () => {
  const userId = useUserStore((s) => s.activeUserId);
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const allConversations = useChatStore((s) => s.conversations);
  const allMessages = useChatStore((s) => s.messages);
  const activeId = useChatStore((s) => s.activeConversationId);
  const agents = useChatStore((s) => s.agents);
  const { agentId, chips, selection, setAgentId, claim } = useAssistantDraft();

  useEffect(() => { claim(userId); }, [claim, userId]);
  useEffect(() => { void useChatStore.getState().loadAgents(); }, []);
  useEffect(() => {
    if (workspaceId && isAiConfigured()) void useChatStore.getState().syncServerConversations(workspaceId);
  }, [workspaceId]);

  const conversations = useMemo(() => conversationsOf(allConversations, userId), [allConversations, userId]);
  // A chat opened and never used is not history; the open one is listed even while empty.
  const history = useMemo(() => {
    const withMessages = new Set(allMessages.map((m) => m.conversationId));
    return conversations.filter((c) => c.id === activeId || !isUntouchedConversation(c, withMessages));
  }, [conversations, allMessages, activeId]);
  // Another account's open conversation shows no trail here.
  const ownActiveId = conversations.some((c) => c.id === activeId) ? activeId : null;
  const [sources, activities] = useMemo(() => {
    const messages = allMessages.filter((m) => m.conversationId === ownActiveId);
    return [sourcesOf(messages), activitiesOf(messages)] as const;
  }, [allMessages, ownActiveId]);
  const trailCount = sources.length + activities.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AssistantChats
        conversations={history}
        activeId={ownActiveId}
        onOpen={openAiChat}
        onNew={startAiChat}
        agents={agents}
        agentId={agentId}
        onPickAgent={setAgentId}
      />
      <details className="border-t border-[var(--osio-border-soft)]">
        <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--osio-focus-ring-color)]">
          This chat
          {trailCount > 0 ? <span className="text-xs tabular-nums text-[var(--osio-fg-subtle)]">{trailCount}</span> : null}
        </summary>
        <ChatContextTabs chips={chips} selection={selection} sources={sources} activities={activities} />
      </details>
      <div className="border-t border-[var(--osio-border-soft)] p-1.5">
        <button
          type="button"
          onClick={() => openAiHub("overview")}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        >
          <Settings2 size={15} aria-hidden="true" /> AI Hub
        </button>
      </div>
    </div>
  );
};
