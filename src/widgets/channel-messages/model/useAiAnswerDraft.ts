/**
 * The "@AI" draft store of the app: aiAnswerDraft.ts over the real AI service
 * and bridge calls. The notice is remembered per user in localStorage; a
 * browser that cannot store it shows the notice again, which is the safe side.
 */

import { noticingWriter } from "@/shared/lib/storage-full/noticingWrite";
import { useStore } from "zustand";

import { cancelRun, createConversation, resumeRun, startThreadRun } from "@/features/ai/api/aiClient";
import { postAiAnswer } from "@/shared/chat/messageApi";

import { createAiDraftStore, type AiDraft } from "./aiAnswerDraft";

const writeAnswerNotice = noticingWriter("AI answer notice");
const noticeKey = (userId: string) => `osionos.ai.channelNotice.${userId}`;

export const aiDraftStore = createAiDraftStore({
  createConversation,
  startThreadRun,
  resumeRun,
  cancelRun,
  postAiAnswer,
  noticeSeen: (userId) => {
    try {
      return globalThis.localStorage?.getItem(noticeKey(userId)) === "1";
    } catch {
      return false;
    }
  },
  markNoticeSeen: (userId) => {
    // Not stored: the notice shows again next time.
    writeAnswerNotice(noticeKey(userId), "1");
  },
  newId: () => globalThis.crypto.randomUUID(),
});

export function useAiDraft(channelId: string): AiDraft | null {
  return useStore(aiDraftStore, (state) => state.drafts[channelId] ?? null);
}
