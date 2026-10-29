/**
 * What each conversation knows about the turns outside its window.
 *
 * Kept apart from the chat store: it is service state, never persisted to the
 * browser, and the chat store is already past its line budget.
 */

import { create } from "zustand";

import { conversationApi } from "./conversationApi";
import type { ConversationSummary, TruncatedFrame } from "./summaryNotice";

export interface SummaryEntry {
  /** undefined: the service sent no `summary` key (flag off, or not read yet). */
  summary: ConversationSummary | null | undefined;
  truncated: TruncatedFrame | null;
}

const EMPTY: SummaryEntry = { summary: undefined, truncated: null };

interface SummaryState {
  byConversation: Record<string, SummaryEntry>;
  setSummary: (conversationId: string, summary: ConversationSummary | null | undefined) => void;
  setTruncated: (conversationId: string, truncated: TruncatedFrame) => void;
  /** Re-reads the transcript for its summary. Never throws. */
  refresh: (conversationId: string, serverId: string) => Promise<void>;
  /** Clears the summary on the service, then here. Throws when the service refuses: the summary stays. */
  clear: (conversationId: string, serverId: string) => Promise<void>;
}

export const entryOf = (state: SummaryState, conversationId: string): SummaryEntry =>
  state.byConversation[conversationId] ?? EMPTY;

export const useSummaryStore = create<SummaryState>((set) => {
  const patch = (conversationId: string, change: Partial<SummaryEntry>) =>
    set((s) => ({ byConversation: { ...s.byConversation, [conversationId]: { ...entryOf(s, conversationId), ...change } } }));
  return {
    byConversation: {},
    setSummary: (conversationId, summary) => patch(conversationId, { summary }),
    setTruncated: (conversationId, truncated) => patch(conversationId, { truncated }),
    refresh: async (conversationId, serverId) => {
      try {
        patch(conversationId, { summary: (await conversationApi().transcript(serverId)).summary });
      } catch (error) {
        console.warn("[chat] could not re-read the summary of a conversation", error);
      }
    },
    clear: async (conversationId, serverId) => {
      await conversationApi().clearSummary(serverId);
      // The next run may summarise again; until then nothing is summarised.
      patch(conversationId, { summary: null, truncated: { summarized: false } });
    },
  };
});
