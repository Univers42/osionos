/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   conversationApi.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import * as client from "@/features/ai/api/aiClient";

/**
 * What the store asks of the AI service about conversations.
 *
 * It sits between the store and the client so a test can swap it: the client
 * reads its "is a service configured" answer from the build's environment,
 * which a test cannot change for the store's own copy of the module.
 */
export interface ConversationApi {
  isConfigured: () => boolean;
  list: typeof client.listConversations;
  transcript: typeof client.getTranscript;
  clearSummary: typeof client.clearConversationSummary;
  rename: typeof client.renameConversation;
  remove: typeof client.deleteConversation;
}

const realApi: ConversationApi = {
  isConfigured: client.isAiConfigured,
  list: client.listConversations,
  transcript: client.getTranscript,
  clearSummary: client.clearConversationSummary,
  rename: client.renameConversation,
  remove: client.deleteConversation,
};

let api: ConversationApi = realApi;

/** Swaps the API, or restores it with no argument. The tests use it; the app never calls it. */
export function setConversationApi(impl?: Partial<ConversationApi>): void {
  api = impl ? { ...realApi, ...impl } : realApi;
}

/** The API in use right now. */
export function conversationApi(): ConversationApi {
  return api;
}
