/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publishApi.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api, getActivePageJwt } from "@/shared/api/client";

/** Publish (snapshot) a page and return its public token, or null on failure. */
export async function publishPage(pageId: string): Promise<string | null> {
  const res = await api.post<{ token?: string }>(`/api/pages/${pageId}/publish`, {}, getActivePageJwt() ?? undefined);
  return res.token ?? null;
}

/** Remove a page's public snapshot. */
export async function unpublishPage(pageId: string): Promise<void> {
  await api.delete(`/api/pages/${pageId}/publish`, getActivePageJwt() ?? undefined);
}
