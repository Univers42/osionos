/**
 * Recourse on a posted AI answer (osio-bot OB6, C437, C439). The row has no
 * human author, so the asker stands in for one: the asker or a channel admin
 * may delete it. A report names the message and no person, since the bridge
 * resolves an AI row to no subject user.
 */

import { useToastStore } from "@osionos/ui/primitives/useToastStore";

import type { ChatMessage } from "@/shared/chat/messageApi";
import { submitReport } from "@/shared/social/reportApi";
import type { ReportPayload } from "@/store/social/types";

export function canDeleteMessage(message: ChatMessage, userId: string, canModerate: boolean): boolean {
  if (message.isAi) return message.aiRequestedBy === userId || canModerate;
  return message.authorId === userId;
}

export function aiAnswerReport(messageId: string): ReportPayload {
  return { subjectKind: "message", subjectId: messageId, category: "ai_answer" };
}

export function reportAiAnswer(message: ChatMessage): void {
  const toast = useToastStore.getState().push;
  submitReport(aiAnswerReport(message.id)).then(
    () => toast({ kind: "success", title: "Report sent" }),
    () => toast({ kind: "error", title: "Couldn't send the report", description: "Check your connection and try again." }),
  );
}
