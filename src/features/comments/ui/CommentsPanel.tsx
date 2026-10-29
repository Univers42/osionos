/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CommentsPanel.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { cx } from "@osionos/ui/shared/classNames";
import { ModerationWarningNotice } from "@/shared/moderation/ModerationWarningNotice";
import type { ModerationWarning } from "@/shared/moderation/moderationWarning";
import type { Comment, CommentWriteResult } from "../api/commentsClient";
import { ThreadMoodHint } from "./ThreadMoodHint";

interface Props {
  /** The page of the thread: with it the panel shows the thread mood, when there is one. */
  pageId?: string;
  comments: Comment[];
  loading: boolean;
  meId: string | null;
  /** Write a comment. The answer is typed: a moderation warning is not an error. */
  onAdd: (content: string, acknowledgeWarning?: boolean) => Promise<CommentWriteResult>;
  onResolve: (id: string, resolved: boolean) => void | Promise<unknown>;
  onRemove: (id: string) => void | Promise<unknown>;
  /** Opens the Assistant with the thread quoted; absent when the AI service is not configured (C424). */
  onAskAI?: () => void;
}

/** Presentational comment thread + composer (⌘↵ to send). */
export const CommentsPanel: React.FC<Props> = ({ pageId, comments, loading, meId, onAdd, onResolve, onRemove, onAskAI }) => {
  const [draft, setDraft] = useState("");
  const [warning, setWarning] = useState<ModerationWarning | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = async (acknowledgeWarning = false) => {
    const text = draft.trim();
    if (!text) return;
    const result = await onAdd(text, acknowledgeWarning);
    if (!result.ok) {
      // The text stays in the composer: the author edits it, or posts it anyway.
      setWarning("warning" in result ? result.warning : null);
      setFailed("message" in result ? result.message : null);
      return;
    }
    setWarning(null);
    setFailed(null);
    setDraft("");
  };

  const edit = () => {
    setWarning(null);
    composerRef.current?.focus();
  };

  return (
    <div className="flex max-h-[60vh] w-80 flex-col">
      {pageId && <ThreadMoodHint pageId={pageId} />}
      {onAskAI && comments.length > 0 && (
        <button
          type="button"
          onClick={onAskAI}
          data-testid="comments-ask-ai"
          className="mx-2 mt-2 inline-flex items-center gap-1 self-start rounded-md px-1.5 py-0.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
        >
          <Sparkles size={12} aria-hidden="true" /> Ask AI about this thread
        </button>
      )}
      <div className="flex-1 overflow-y-auto p-2">
        {comments.length === 0 && !loading && (
          <p className="px-2 py-6 text-center text-xs text-[var(--osio-fg-subtle)]">No comments yet.</p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className={cx("mb-1 rounded-md px-2 py-1.5 hover:bg-[var(--osio-bg-hover)]", comment.resolvedAt ? "opacity-60" : "")}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--osio-fg-muted)]">{comment.authorId === meId ? "You" : "Member"}</span>
              {comment.authorId === meId && (
                <span className="flex gap-2">
                  <button type="button" onClick={() => void onResolve(comment.id, !comment.resolvedAt)} className="text-3xs text-[var(--osio-fg-subtle)] hover:text-[var(--osio-accent)]">
                    {comment.resolvedAt ? "Reopen" : "Resolve"}
                  </button>
                  <button type="button" onClick={() => void onRemove(comment.id)} className="text-3xs text-[var(--osio-fg-subtle)] hover:text-[var(--osio-danger)]">
                    Delete
                  </button>
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-[var(--osio-fg-default)]">{comment.content}</p>
            {comment.moderationState === "held" && comment.authorId === meId && (
              <p className="mt-0.5 text-3xs text-[var(--osio-fg-subtle)]">Held for review — only you can see it</p>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--osio-border-default)] p-2">
        {/* The warning is announced, not shouted: the author hears it once. */}
        <div aria-live="polite">
          {failed && <p className="mb-1.5 text-xs text-[var(--osio-danger)]">{failed}</p>}
          {warning && (
            <ModerationWarningNotice
              warning={warning}
              onEdit={edit}
              onConfirm={() => void submit(true)}
              confirmLabel="Post anyway"
            />
          )}
        </div>
        <textarea
          ref={composerRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void submit(); } }}
          rows={2}
          placeholder="Add a comment…"
          className="w-full resize-none rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1.5 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        />
        <div className="mt-1 flex justify-end">
          <button type="button" onClick={() => void submit()} disabled={!draft.trim()} className="rounded-md bg-[var(--osio-accent)] px-2.5 py-1 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90 disabled:opacity-50">
            Comment
          </button>
        </div>
      </div>
    </div>
  );
};
