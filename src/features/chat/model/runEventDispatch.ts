/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   runEventDispatch.ts                                :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The frames of a run, and what they do.
 *
 * A run is a stream of frames: `run.started`, `citation`, `tool.called`,
 * `tool.result`, `permission.asked`, `text.delta`, `done`, `error`. The store
 * used to read them in one long `if` chain, inside the `send` of the chat, and
 * the chain grew with every frame the service learned.
 *
 * The dispatch is that chain, out of the store: an event and its data go in,
 * the actions of the store come out. It knows NOTHING of the store — it calls
 * the actions it is given, and it decides which action a frame reaches.
 *
 * A frame the client does not know is ignored: the service may learn a new
 * one, and the chat must not break.
 */

import type { ChatMessage, ChatMessagePart } from "./chatTypes";
import { citationFromEvent } from "./citations";

/** What the dispatch needs from the store. */
export interface RunEventActions {
  /** Appends a piece of the answer. */
  appendText(chunk: string): void;
  /** Keeps a source of the answer. */
  appendCitation(citation: ChatMessagePart): void;
  /** A call of a tool: what the assistant is doing. */
  appendToolCall(data: Record<string, unknown>): void;
  /** The outcome of a call. */
  appendToolResult(data: Record<string, unknown>): void;
  /** The sources a call found. */
  appendToolSource(data: Record<string, unknown>): void;
  /** Changes the message of the assistant. */
  patchAssistant(patch: Partial<ChatMessage>): void;
  /** The service named the conversation: the default title gives way to it. */
  applyServerTitle(title: string): void;
}

/**
 * One frame of a run, and what it does.
 *
 * The order of the frames does not matter: each one is read on its own, and
 * the store keeps what it needs.
 */
export function dispatchRunEvent(
  event: string,
  data: Record<string, unknown>,
  actions: RunEventActions,
): void {
  if (event === "text.delta") {
    if (typeof data.text === "string") actions.appendText(data.text);
    return;
  }
  if (event === "citation") {
    const citation = citationFromEvent(data);
    if (!citation) return;
    actions.appendCitation({
      type: "citation",
      pageId: citation.pageId,
      ...(citation.blockId ? { blockId: citation.blockId } : {}),
      title: citation.title,
      snippet: citation.snippet,
    });
    // The sources a tool found are its result: they arrive between the call
    // and its outcome.
    actions.appendToolSource(data);
    return;
  }
  if (event === "tool.called") {
    actions.appendToolCall(data);
    return;
  }
  if (event === "tool.result") {
    actions.appendToolResult(data);
    return;
  }
  if (event === "run.started") {
    if (typeof data.runId === "string") actions.patchAssistant({ runId: data.runId });
    if (typeof data.conversationTitle === "string") actions.applyServerTitle(data.conversationTitle);
    return;
  }
  if (event === "done") {
    actions.patchAssistant({ status: "done" });
    return;
  }
  if (event === "error") {
    actions.patchAssistant({
      status: "error",
      errorCode: typeof data.code === "string" ? data.code : "internal",
    });
  }
}
