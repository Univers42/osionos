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
import { warningFrom, type ModerationWarning } from "@/shared/moderation/moderationWarning";
import { shownForPublish } from "./publishedView";

/** The typed answer of a publish: published, warned about, or failed. */
export type PublishPageResult =
  | { ok: true; token: string | null }
  | { ok: false; warning: ModerationWarning }
  | { ok: false; message: string };

/**
 * Publish (snapshot) a page and return its public token.
 *
 * `acknowledgeWarning` is the author saying "publish it anyway": without it the
 * bridge answers 409 (L0 asked first) and NOTHING is published. The answer is a
 * typed result, so the caller shows the warning instead of an unhandled
 * rejection. The body also names the gated blocks and cells the owner's view
 * shows (`shown`), the only gated content the snapshot copies (#61).
 */
export async function publishPage(
  pageId: string,
  { acknowledgeWarning }: { acknowledgeWarning?: boolean } = {},
): Promise<PublishPageResult> {
  try {
    const shown = await shownForPublish(pageId);
    const res = await api.post<{ token?: string }>(
      `/api/pages/${pageId}/publish`,
      acknowledgeWarning ? { shown, acknowledgeWarning: true } : { shown },
      getActivePageJwt() ?? undefined,
    );
    return { ok: true, token: res.token ?? null };
  } catch (error) {
    const warning = warningFrom(error);
    if (warning) return { ok: false, warning };
    return { ok: false, message: error instanceof Error ? error.message : "The page could not be published." };
  }
}

/** Remove a page's public snapshot. */
export async function unpublishPage(pageId: string): Promise<void> {
  await api.delete(`/api/pages/${pageId}/publish`, getActivePageJwt() ?? undefined);
}
