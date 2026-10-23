/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useComments.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useState } from "react";
import {
  deleteComment,
  fetchComments,
  patchComment,
  postComment,
  type Comment,
  type CommentWriteResult,
} from "../api/commentsClient";

/** Load + mutate a page's comments. `enabled` skips fetching while the panel is closed. */
export function useComments(pageId: string, enabled: boolean) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    try {
      setComments(await fetchComments(pageId));
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { if (enabled) void reload(); }, [enabled, reload]);

  /**
   * Write a comment. The result is TYPED: a moderation warning is an answer,
   * not an exception, so the panel can ask the author what to do about it.
   */
  const add = useCallback(
    async (content: string, blockId?: string | null, acknowledgeWarning = false): Promise<CommentWriteResult> => {
      const result = await postComment(pageId, content, blockId, acknowledgeWarning);
      if (result.ok) {
        const created = result.comment;
        if (created) setComments((prev) => [...prev, created]);
      }
      return result;
    },
    [pageId],
  );

  const resolve = useCallback(async (id: string, resolved: boolean): Promise<CommentWriteResult> => {
    const result = await patchComment(id, { resolved });
    if (result.ok) {
      setComments((prev) => prev.map((comment) => (comment.id === id ? { ...comment, resolvedAt: resolved ? new Date().toISOString() : null } : comment)));
    }
    return result;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteComment(id);
    setComments((prev) => prev.filter((comment) => comment.id !== id));
  }, []);

  return { comments, loading, add, resolve, remove };
}
