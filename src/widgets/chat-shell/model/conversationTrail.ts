import type { ChatMessage } from "@/features/chat/model/chatTypes";
import { citationsFromParts, type Citation } from "@/features/chat/model/citations";
import { toolActivitiesFromParts, type ToolActivityPart } from "@/features/chat/model/toolActivity";

/** A source the conversation read, once, with the number of answers that cited it. */
export interface TrailSource {
  key: string;
  citation: Citation;
  answers: number;
}

/** A tool call, with the answer it belongs to. */
export interface TrailActivity {
  messageId: string;
  activity: ToolActivityPart;
}

function sourceKey(citation: Citation): string {
  if (citation.collection === "page") return `page:${citation.pageId}`;
  if (citation.collection === "web") return `web:${citation.url}`;
  return `pack:${citation.pack}:${citation.title}`;
}

/** Every source the answers cited, first citation first; a page cited by three answers is listed once. */
export function sourcesOf(messages: readonly ChatMessage[]): TrailSource[] {
  const byKey = new Map<string, TrailSource>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const seenHere = new Set<string>();
    for (const citation of citationsFromParts(message.parts)) {
      const key = sourceKey(citation);
      const known = byKey.get(key);
      if (!known) byKey.set(key, { key, citation, answers: 1 });
      else if (!seenHere.has(key)) known.answers += 1;
      seenHere.add(key);
    }
  }
  return [...byKey.values()];
}

/** Every tool call of the conversation, in the order the assistant made them. */
export function activitiesOf(messages: readonly ChatMessage[]): TrailActivity[] {
  return messages.flatMap((message) =>
    message.role === "assistant"
      ? toolActivitiesFromParts(message.parts).map((activity) => ({ messageId: message.id, activity }))
      : [],
  );
}
