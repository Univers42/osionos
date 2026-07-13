/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   commentsClient.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
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
}

const jwt = () => getActivePageJwt() ?? undefined;

export async function fetchComments(pageId: string): Promise<Comment[]> {
  const res = await api.get<{ comments?: Comment[] }>(`/api/comments?pageId=${pageId}`, jwt());
  return Array.isArray(res.comments) ? res.comments : [];
}

export async function postComment(pageId: string, content: string, blockId?: string | null): Promise<Comment | null> {
  const res = await api.post<{ comment?: Comment }>("/api/comments", { pageId, content, blockId: blockId ?? null }, jwt());
  return res.comment ?? null;
}

export async function patchComment(id: string, patch: { content?: string; resolved?: boolean }): Promise<void> {
  await api.patch(`/api/comments/${id}`, patch, jwt());
}

export async function deleteComment(id: string): Promise<void> {
  await api.delete(`/api/comments/${id}`, jwt());
}
