/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   commentsClient.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api, getActivePageJwt } from "@/shared/api/client";
import { warningFrom, type ModerationWarning } from "@/shared/moderation/moderationWarning";

export interface Comment {
  id: string;
  pageId: string;
  blockId: string | null;
  authorId: string;
  content: string;
  resolvedAt: string | null;
  createdAt: string;
  /** C87: the soft moderation state. 'held' means only the author sees it. */
  moderationState?: "visible" | "held" | "removed" | null;
}

/**
 * The typed answer of a comment write: written, warned about, or failed.
 * The warning is L0's (C85) — the shared one every client that writes public
 * text reads.
 */
export type CommentWriteResult =
  | { ok: true; comment: Comment | null }
  | { ok: false; warning: ModerationWarning }
  | { ok: false; message: string };

const jwt = () => getActivePageJwt() ?? undefined;

/** A failed write: the moderation warning when there is one, the error otherwise. */
function failure(error: unknown): CommentWriteResult {
  const warning = warningFrom(error);
  if (warning) return { ok: false, warning };
  return { ok: false, message: error instanceof Error ? error.message : "The comment could not be saved." };
}

export async function fetchComments(pageId: string): Promise<Comment[]> {
  const res = await api.get<{ comments?: Comment[] }>(`/api/comments?pageId=${pageId}`, jwt());
  return Array.isArray(res.comments) ? res.comments : [];
}

/**
 * Write a comment. `acknowledgeWarning` is the author saying "post it anyway":
 * without it the bridge answers 409 and nothing is written.
 */
export async function postComment(
  pageId: string,
  content: string,
  blockId?: string | null,
  acknowledgeWarning = false,
): Promise<CommentWriteResult> {
  try {
    const res = await api.post<{ comment?: Comment }>(
      "/api/comments",
      { pageId, content, blockId: blockId ?? null, acknowledgeWarning },
      jwt(),
    );
    return { ok: true, comment: res.comment ?? null };
  } catch (error) {
    return failure(error);
  }
}

export async function patchComment(
  id: string,
  patch: { content?: string; resolved?: boolean; acknowledgeWarning?: boolean },
): Promise<CommentWriteResult> {
  try {
    await api.patch(`/api/comments/${id}`, patch, jwt());
    return { ok: true, comment: null };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteComment(id: string): Promise<void> {
  await api.delete(`/api/comments/${id}`, jwt());
}
