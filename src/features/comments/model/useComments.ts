/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useComments.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useState } from "react";
import { deleteComment, fetchComments, patchComment, postComment, type Comment } from "../api/commentsClient";

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

  const add = useCallback(async (content: string, blockId?: string | null) => {
    const created = await postComment(pageId, content, blockId);
    if (created) setComments((prev) => [...prev, created]);
  }, [pageId]);

  const resolve = useCallback(async (id: string, resolved: boolean) => {
    await patchComment(id, { resolved });
    setComments((prev) => prev.map((comment) => (comment.id === id ? { ...comment, resolvedAt: resolved ? new Date().toISOString() : null } : comment)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteComment(id);
    setComments((prev) => prev.filter((comment) => comment.id !== id));
  }, []);

  return { comments, loading, add, resolve, remove };
}
