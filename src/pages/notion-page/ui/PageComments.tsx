/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageComments.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useState } from "react";
import { Send } from "lucide-react";

import { useUserStore } from "@/features/auth";
import { useRealtimeMessagesStore, type RealtimeMessage } from "@/services/realtime-messages";

const EMPTY_MESSAGES: RealtimeMessage[] = [];

interface Props {
  pageId: string;
  open: boolean;
  onClose: () => void;
}

/** Page comments panel (realtime thread `page:<id>:comments`). Renders only when open. */
export const PageComments: React.FC<Props> = ({ pageId, open, onClose }) => {
  const [commentDraft, setCommentDraft] = useState("");
  const activeUserId = useUserStore((s) => s.activeUserId);
  const persona = useUserStore((s) => s.activePersona());
  const safeUserId = activeUserId || "anonymous";
  const comments = useRealtimeMessagesStore((s) => s.messagesByThread[`page:${pageId}:comments`] ?? EMPTY_MESSAGES);
  const sendMessage = useRealtimeMessagesStore((s) => s.sendMessage);

  const handleSubmit = useCallback((event: { preventDefault: () => void }) => {
    event.preventDefault();
    const sent = sendMessage(`page:${pageId}:comments`, safeUserId, persona?.name ?? safeUserId, commentDraft);
    if (sent) setCommentDraft("");
  }, [commentDraft, pageId, persona?.name, safeUserId, sendMessage]);

  if (!open) return null;

  return (
    <section className="mb-4 max-w-xl rounded-xl border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] p-3">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--osio-fg-default)]">Page comments</p>
        <button
          type="button"
          className="text-xs text-[var(--osio-fg-muted)] hover:text-[var(--osio-fg-default)]"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="mb-3 max-h-44 space-y-2 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-xs text-[var(--osio-fg-muted)]">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <article key={comment.id} className="rounded-lg bg-[var(--osio-bg-surface)] px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-[var(--osio-fg-default)]">{comment.authorName}</span>
                <span className="text-[var(--osio-fg-subtle)]">
                  {new Date(comment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--osio-fg-default)]">{comment.body}</p>
            </article>
          ))
        )}
      </div>
      <form className="flex items-end gap-2" onSubmit={handleSubmit}>
        <textarea
          value={commentDraft}
          onChange={(event) => setCommentDraft(event.currentTarget.value)}
          rows={2}
          placeholder="Write a comment…"
          className="min-h-10 flex-1 resize-none rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--osio-accent)]"
        />
        <button
          type="submit"
          disabled={!commentDraft.trim()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send comment"
        >
          <Send size={16} />
        </button>
      </form>
    </section>
  );
};
