/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-conversation-title.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The name of a conversation: the service gives one, the reader may rename it.
 *
 * Pure logic only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CONVERSATION_TITLE,
  resolveConversationTitle,
} from "@/features/chat/model/conversationTitle";

test("the default title gives way to the title the service set", () => {
  assert.equal(resolveConversationTitle(DEFAULT_CONVERSATION_TITLE, "What is the plan?"), "What is the plan?");
  assert.equal(resolveConversationTitle("", "What is the plan?"), "What is the plan?");
});

test("a title the reader renamed is kept", () => {
  assert.equal(resolveConversationTitle("My own title", "What is the plan?"), "My own title");
});

test("no title from the service changes nothing", () => {
  assert.equal(resolveConversationTitle(DEFAULT_CONVERSATION_TITLE, undefined), DEFAULT_CONVERSATION_TITLE);
  assert.equal(resolveConversationTitle(DEFAULT_CONVERSATION_TITLE, "   "), DEFAULT_CONVERSATION_TITLE);
});
