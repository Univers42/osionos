/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkSnapshot.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { EmbedSnapshot } from "@/shared/lib/embed";

/** The snapshot an embed/bookmark/media block stores for `url`. Call only once the
 *  user has chosen to embed, bookmark or mention (never on paste): it may reach the
 *  bridge, which fetches the URL. Throws `EmbedUrlError` for a URL that is not http(s). */
export async function resolveLinkSnapshot(url: string): Promise<EmbedSnapshot> {
  // On demand: the resolver and provider table stay out of the editor's warm chunk.
  const { resolveEmbed } = await import("@/shared/lib/embed");
  const info = await resolveEmbed(url);
  return { ...info, resolvedAt: new Date().toISOString() };
}
