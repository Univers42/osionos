/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   conversationExport.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import type { ChatMessage, Conversation } from "./chatTypes";

/**
 * The Markdown of a conversation: the title, then each message under its speaker.
 *
 * Only the text is exported. Caveat: tool calls, citations and images in the
 * parts are not in the file, and a system message is skipped.
 */
export function conversationMarkdown(conversation: Pick<Conversation, "title">, messages: readonly ChatMessage[]): string {
  const blocks = [`# ${conversation.title.trim() || "New conversation"}`];
  for (const message of messages) {
    if (message.role === "system" || !message.content.trim()) continue;
    const speaker = message.role === "user" ? "You" : "Assistant";
    blocks.push(`**${speaker}:**\n\n${message.content.trim()}`);
  }
  return `${blocks.join("\n\n")}\n`;
}

/** A file name from a title: letters and digits, one dash between words. */
export function markdownFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "conversation"}.md`;
}

/** Hands the Markdown to the browser as a download. */
export function downloadMarkdown(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
