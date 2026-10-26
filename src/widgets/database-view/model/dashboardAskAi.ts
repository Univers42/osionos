/**
 * "Ask AI" from a dashboard widget (h2-ask-everywhere, C419-C428): what the
 * widget shows, quoted under its title, goes to the Assistant's composer.
 * Nothing is sent until the user presses Send (C421); without the AI service
 * the adapter is absent and the kit draws no button (C424).
 */

import type { HostAdapters } from "@notion-db/object-database";
import { quoteForAssistant } from "@/features/chat/model/assistantHandoff";
import { openAssistantWith } from "@/features/chat/model/openAssistantWith";

export function dashboardAskAI(aiConfigured: boolean): HostAdapters["onAskAI"] {
  if (!aiConfigured) return undefined;
  return ({ title, text }) => openAssistantWith({ text: quoteForAssistant([{ author: title, text }]) });
}
