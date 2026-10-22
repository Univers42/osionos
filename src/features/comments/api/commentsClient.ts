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
 * What L0 answered before a comment was written (C85): the author's own words
 * may hurt someone. The terms are the words that tripped a rule — they belong
 * to this screen and to nothing else (C94).
 */
export interface ModerationWarning {
  code: "moderation_warning";
  message: string;
  reasons: string[];
  terms: string[];
}

/** The typed answer of a comment write: written, warned about, or failed. */
export type CommentWriteResult =
  | { ok: true; comment: Comment | null }
  | { ok: false; warning: ModerationWarning }
  | { ok: false; message: string };

const jwt = () => getActivePageJwt() ?? undefined;

/** The 409 the bridge answers when L0 wants the author's answer first. */
function warningFrom(error: unknown): ModerationWarning | null {
  const candidate = error as { status?: number; code?: string; message?: string; details?: unknown } | null;
  if (!candidate || candidate.status !== 409 || candidate.code !== "moderation_warning") return null;
  const details = (candidate.details ?? {}) as { reasons?: unknown; terms?: unknown };
  return {
    code: "moderation_warning",
    message: candidate.message ?? "This may hurt someone. Edit it, or post it anyway.",
    reasons: Array.isArray(details.reasons) ? details.reasons.map(String) : [],
    terms: Array.isArray(details.terms) ? details.terms.map(String) : [],
  };
}

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
