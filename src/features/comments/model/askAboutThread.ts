/**
 * The comments an "Ask AI about this thread" quotes (C422): the ones the
 * viewer sees. A comment held or removed by moderation is quoted only when it
 * is the viewer's own — the panel shows it to them alone.
 */

import type { QuotedEntry } from "@/features/chat/model/assistantHandoff";
import type { Comment } from "../api/commentsClient";

export function threadEntries(comments: readonly Comment[], meId: string | null): QuotedEntry[] {
  return comments
    .filter((comment) => !comment.moderationState || comment.moderationState === "visible" || comment.authorId === meId)
    .map((comment) => ({ author: comment.authorId === meId ? "You" : "Member", text: comment.content }));
}
