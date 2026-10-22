/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mediaLinkSnapshot.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { EmbedSnapshot } from "@/shared/lib/embed/embedInfo";
import { resolveProviderEmbed } from "@/shared/lib/embed/embedProviders";
import { safeHttpUrl } from "@/shared/lib/embed/embedUrlGuard";

import { resolveLinkSnapshot } from "./linkSnapshot";

/** The snapshot a video/audio/file block stores next to its `asset`, only when the
 *  link is a provider page (YouTube, Spotify, Drive, …) whose facade wants a title
 *  and thumbnail. A direct file URL, or a failed lookup, stores none: the block
 *  still plays from the URL alone. Call only on the user's submit. */
export async function snapshotForMediaLink(url: string): Promise<EmbedSnapshot | undefined> {
  const href = safeHttpUrl(url);
  if (href === "" || resolveProviderEmbed(href) === null) return undefined;
  try {
    return await resolveLinkSnapshot(href);
  } catch {
    return undefined;
  }
}
