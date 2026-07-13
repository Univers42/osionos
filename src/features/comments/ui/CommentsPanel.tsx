/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CommentsPanel.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from "react";
import { cx } from "@/shared/ui/shared/classNames";
import type { Comment } from "../api/commentsClient";

interface Props {
  comments: Comment[];
  loading: boolean;
  meId: string | null;
  onAdd: (content: string) => void | Promise<void>;
  onResolve: (id: string, resolved: boolean) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
}

/** Presentational comment thread + composer (⌘↵ to send). */
export const CommentsPanel: React.FC<Props> = ({ comments, loading, meId, onAdd, onResolve, onRemove }) => {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void onAdd(text);
  };

  return (
    <div className="flex max-h-[60vh] w-80 flex-col">
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
                  <button type="button" onClick={() => void onResolve(comment.id, !comment.resolvedAt)} className="text-[10px] text-[var(--osio-fg-subtle)] hover:text-[var(--osio-accent)]">
                    {comment.resolvedAt ? "Reopen" : "Resolve"}
                  </button>
                  <button type="button" onClick={() => void onRemove(comment.id)} className="text-[10px] text-[var(--osio-fg-subtle)] hover:text-[var(--osio-danger)]">
                    Delete
                  </button>
                </span>
              )}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-[var(--osio-fg-default)]">{comment.content}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--osio-border-default)] p-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); submit(); } }}
          rows={2}
          placeholder="Add a comment…"
          className="w-full resize-none rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1.5 text-sm text-[var(--osio-fg-default)] placeholder:text-[var(--osio-fg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        />
        <div className="mt-1 flex justify-end">
          <button type="button" onClick={submit} disabled={!draft.trim()} className="rounded-md bg-[var(--osio-accent)] px-2.5 py-1 text-xs font-medium text-[var(--osio-accent-fg)] hover:opacity-90 disabled:opacity-50">
            Comment
          </button>
        </div>
      </div>
    </div>
  );
};
