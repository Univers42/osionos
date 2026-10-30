/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   channelWrites.ts                                   :+:      :+:    :+:   */
/*                                                    +#+  :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+   +#+           */
/*   Created: 2026/10/22 15:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The channel writes, and the TYPED answer they give.
 *
 * The bridge asks the author BEFORE it writes a message whose words may hurt
 * someone (L0, C85): in mode hold/on a risky text answers 409
 * `moderation_warning` and NOTHING is written until the client resends with
 * `acknowledgeWarning: true`. A DM is never asked (C94).
 *
 * The answer is typed because a warning is NOT a failure: the screen shows the
 * warning and the author answers it ("Edit", or "post it anyway"). A
 * connection error carries no warning — the screen says so.
 *
 * The writes live here, apart from the hook that calls them, so the rule can
 * be read — and checked — without a React tree.
 */

import { warningFrom, type ModerationWarning } from '@/shared/moderation/moderationWarning';
import {
  editMessage,
  sendMessage,
  type Attachment,
  type ChatMessage,
  type WriteOptions,
} from '@/shared/chat/messageApi';

import { PENDING_MESSAGE_PREFIX } from './historyCatchUp';

/** The typed answer of a channel write: written, warned about, or failed. */
export type SendOutcome =
  | { ok: true; message?: ChatMessage }
  | { ok: false; warning: ModerationWarning }
  | { ok: false };

/** Where a write lands: the channel, the author, and the list to reconcile. */
export interface ChannelWriteTarget {
  channelId: string;
  userId: string;
  userName: string;
  setMessages: (updater: (messages: ChatMessage[]) => ChatMessage[]) => void;
}

/** The row the sender sees before the bridge answers. */
function optimisticRow(target: ChannelWriteTarget, content: string, attachments?: Attachment[]): ChatMessage {
  return {
    id: `${PENDING_MESSAGE_PREFIX}${Date.now()}-${crypto.randomUUID()}`,
    channelId: target.channelId,
    authorId: target.userId,
    authorName: target.userName,
    authorAvatar: null,
    content,
    createdAt: new Date().toISOString(),
    reactions: [],
    attachments: attachments ?? [],
    mentions: [],
    threadRootId: null,
    replyCount: 0,
    replyTo: null,
  };
}

/**
 * Post a message to a channel.
 *
 * The message shows at once under a temp id and is reconciled with the
 * server's row when the bridge answers (the WS echo de-dupes by id, so a
 * double never sticks). The temp row is dropped when the write did NOT happen
 * — a warning included, because L0 wrote nothing.
 */
export async function sendChannelMessage(
  target: ChannelWriteTarget,
  content: string,
  attachments?: Attachment[],
  replyTo?: string,
  options?: WriteOptions,
): Promise<SendOutcome> {
  const optimistic = optimisticRow(target, content, attachments);
  target.setMessages((messages) => [...messages, optimistic]);
  try {
    const message = await sendMessage(target.channelId, content, attachments, replyTo, options);
    target.setMessages((messages) => {
      const withoutTemp = messages.filter((m) => m.id !== optimistic.id);
      return withoutTemp.some((m) => m.id === message.id) ? withoutTemp : [...withoutTemp, message];
    });
    return { ok: true, message };
  } catch (error) {
    target.setMessages((messages) => messages.filter((m) => m.id !== optimistic.id));
    const warning = warningFrom(error);
    return warning ? { ok: false, warning } : { ok: false };
  }
}

/**
 * Edit a message.
 *
 * The answer is typed and never throws: a warning is L0's question (the notice
 * answers it), any other failure is one line of text. The message keeps the
 * text the author wrote until the write really happened — an edit is never
 * lost to a failure.
 */
export async function editChannelMessage(
  setMessages: (updater: (messages: ChatMessage[]) => ChatMessage[]) => void,
  messageId: string,
  content: string,
  options?: WriteOptions,
): Promise<SendOutcome> {
  try {
    const updated = await editMessage(messageId, content, options);
    setMessages((messages) => messages.map((m) => (m.id === messageId ? { ...m, ...updated } : m)));
    return { ok: true };
  } catch (error) {
    const warning = warningFrom(error);
    return warning ? { ok: false, warning } : { ok: false };
  }
}
