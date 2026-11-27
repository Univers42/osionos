/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AgentConversationPage.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React from "react";

import { useAgentConversation } from "../model/useAgentConversation";
import { AgentComposer } from "./AgentComposer";
import { AgentHeader } from "./AgentHeader";
import { AgentMessageList } from "./AgentMessageList";
import { AgentParameters } from "./AgentParameters";

interface AgentConversationPageProps {
  pageId: string;
}

/**
 * The agent conversation screen: composition only, state lives in
 * `useAgentConversation`. A section, not <main>: the workspace already has the
 * page's one main landmark.
 */
export const AgentConversationPage: React.FC<AgentConversationPageProps> = ({ pageId }) => {
  const agent = useAgentConversation(pageId);
  const { settings, messages } = agent;
  const agentLabel = settings.agent === "default" ? "default agent" : settings.agent;

  return (
    <div className="flex h-full min-w-0 bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]">
      <section aria-label="Agent conversation" className="flex min-w-0 flex-1 flex-col">
        <AgentHeader
          title={agent.title}
          subtitle={`Claude MCP · ${messages.length} messages · ${agentLabel}`}
          canOpenCreatedPage={Boolean(agent.latestCreatedPage?.createdPageId)}
          onOpenCreatedPage={agent.openLatestCreatedPage}
          onReset={agent.resetConversation}
        />
        <AgentParameters settings={settings} onPatch={agent.patchSettings} onToggleTool={agent.toggleTool} />
        <AgentMessageList messages={messages} scrollRef={agent.scrollRef} />
        <AgentComposer draft={agent.draft} running={agent.running} onDraftChange={agent.setDraft} onSend={(prompt) => void agent.runAgent(prompt)} />
      </section>
    </div>
  );
};
