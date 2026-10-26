/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   assistantTurn.ts                                   :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The turn of the assistant: its message, and what the frames do to it.
 *
 * A turn is ONE assistant message and everything that happens to it: the text
 * of the answer, the sources, the calls of the tools, the card of a write, and
 * the title the service gives to the conversation. The store owns the
 * messages; the turn owns one of them, and the frames of the run go through
 * it.
 *
 * The turn is PURE with respect to the store: it never touches the store
 * itself, it calls the narrow operations it is given. That is what lets the
 * same turn serve a run that answers a question and the follow-up of a write
 * the user just approved.
 */

import type { ChatMessage, ChatMessagePart } from "./chatTypes";
import { resolveConversationTitle } from "./conversationTitle";
import { withToolCall, withToolResult, withToolSource } from "./toolActivity";
import { withPermission } from "./approvalParts";
import type { PermissionPart } from "./approvalParts";
import { withMemoryProposal } from "./memoryParts";
import type { MemoryProposalPart } from "./memoryParts";
import { withHandoff } from "./agentHandoff";
import type { HandoffPart } from "./agentHandoff";
import type { RunEventActions } from "./runEventDispatch";

/** What a turn needs from the store. */
export interface TurnStore {
  /** The messages of the store, as they stand. */
  messages(): ChatMessage[];
  /** Adds a message to the store. */
  addMessage(message: ChatMessage): void;
  /** Replaces a message of the store. */
  patchMessage(id: string, patch: Partial<ChatMessage>): void;
  /** The title a conversation has now. */
  conversationTitle(conversationId: string): string;
  /** Names a conversation — the service named it. */
  writeTitle(conversationId: string, title: string): void;
}

/** A turn of the assistant: its message, and the actions the frames use. */
export interface AssistantTurn extends RunEventActions {
  /** The id of the message of the turn. */
  readonly id: string;
  /** The turn is over: the message says so. */
  finish(): void;
}

/**
 * The turn of one assistant message.
 *
 * The message is already there: the store creates it (it owns the ids and the
 * clock), and the turn binds the frames of the run to it.
 */
export function assistantTurn(
  store: TurnStore,
  assistantId: string,
  conversationId: string,
): AssistantTurn {
  /** The parts of the message, as they stand. */
  const parts = (): ChatMessagePart[] =>
    store.messages().find((message) => message.id === assistantId)?.parts ?? [];

  /** Changes the message of the turn. */
  const patch = (change: Partial<ChatMessage>) => store.patchMessage(assistantId, change);

  /**
   * The parts of the message, with what the tools said put in them.
   *
   * A frame that changes nothing leaves the parts as they are: the answer is
   * not written again for nothing.
   */
  const patchParts = (change: (parts: ChatMessagePart[]) => ChatMessagePart[]) => {
    const current = parts();
    const next = change(current);
    if (next === current) return;
    patch({ parts: next });
  };

  return {
    id: assistantId,

    appendText(chunk: string) {
      const current = store.messages().find((message) => message.id === assistantId)?.content ?? "";
      patch({ content: current + chunk });
    },

    appendCitation(citation: ChatMessagePart) {
      patchParts((current) => [...current, citation]);
    },

    appendToolCall(data: Record<string, unknown>) {
      patchParts((current) => withToolCall(current, data));
    },

    appendToolResult(data: Record<string, unknown>) {
      patchParts((current) => withToolResult(current, data));
    },

    appendToolSource(data: Record<string, unknown>) {
      patchParts((current) => withToolSource(current, data));
    },

    patchAssistant(change: Partial<ChatMessage>) {
      patch(change);
    },

    applyServerTitle(serverTitle: string) {
      const current = store.conversationTitle(conversationId);
      const title = resolveConversationTitle(current, serverTitle);
      if (title === current) return;
      store.writeTitle(conversationId, title);
    },

    askPermission(permission: PermissionPart) {
      patchParts((current) => withPermission(current, permission));
    },

    proposeMemory(proposal: MemoryProposalPart) {
      patchParts((current) => withMemoryProposal(current, proposal));
    },

    suggestAgent(handoff: HandoffPart) {
      patchParts((current) => withHandoff(current, handoff));
    },

    finish() {
      const message = store.messages().find((candidate) => candidate.id === assistantId);
      // The stream ended without a terminal frame (a stop, or a run that gave
      // up): what arrived stays, and the answer is not marked as failed.
      if (message?.status === "streaming") patch({ status: "done" });
    },
  };
}
