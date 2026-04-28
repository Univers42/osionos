import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RealtimeMessage {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface RealtimeMessagesStore {
  messagesByThread: Record<string, RealtimeMessage[]>;
  sendMessage: (threadId: string, authorId: string, authorName: string, body: string) => RealtimeMessage | null;
  addRemoteMessage: (message: RealtimeMessage) => void;
}

const CHANNEL_NAME = "osionos:realtime-messages";
let broadcastChannel: BroadcastChannel | null = null;
let initialized = false;

function sortMessages(messages: RealtimeMessage[]): RealtimeMessage[] {
  return [...messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function appendMessage(
  current: Record<string, RealtimeMessage[]>,
  message: RealtimeMessage,
): Record<string, RealtimeMessage[]> {
  const threadMessages = current[message.threadId] ?? [];
  if (threadMessages.some((item) => item.id === message.id)) {
    return current;
  }

  return {
    ...current,
    [message.threadId]: sortMessages([...threadMessages, message]),
  };
}

export const useRealtimeMessagesStore = create<RealtimeMessagesStore>()(
  persist(
    (set) => ({
      messagesByThread: {},
      sendMessage: (threadId, authorId, authorName, body) => {
        const trimmed = body.trim();
        if (!trimmed) return null;

        const message: RealtimeMessage = {
          id: `msg-${crypto.randomUUID()}`,
          threadId,
          authorId,
          authorName,
          body: trimmed,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          messagesByThread: appendMessage(state.messagesByThread, message),
        }));
        broadcastChannel?.postMessage(message);
        return message;
      },
      addRemoteMessage: (message) => {
        set((state) => ({
          messagesByThread: appendMessage(state.messagesByThread, message),
        }));
      },
    }),
    { name: "osionos:realtime-messages" },
  ),
);

export function initRealtimeMessagesBridge() {
  if (initialized || typeof BroadcastChannel === "undefined") return;
  initialized = true;
  broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  broadcastChannel.onmessage = (event: MessageEvent<RealtimeMessage>) => {
    const message = event.data;
    if (!message?.id || !message.threadId) return;
    useRealtimeMessagesStore.getState().addRemoteMessage(message);
  };
}
