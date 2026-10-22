/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mediaProviderLinks.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Cheap pre-check for a video/audio/file block whose link might be a provider page
 * (YouTube, Spotify, Drive …). It exists so the provider table is only loaded
 * for links that could need it; the table still makes the real decision.
 *
 * Caveat: extension-based, like chooseEmbedView. A page URL that happens to end in
 * `.mp4` plays as a bare <video> and fails; a media URL with no extension costs one
 * lazy check and is then played directly.
 */

const DIRECT_MEDIA_EXTENSION = /\.(mp4|webm|mov|m4v|ogv|mp3|wav|ogg|m4a|flac|aac)$/i;
const HTTP_URL = /^https?:\/\//i;

export function mayBeProviderLink(type: string, url: string): boolean {
  if (type !== "video" && type !== "audio" && type !== "file") return false;
  if (!HTTP_URL.test(url)) return false;
  if (type === "file") return true;
  return !DIRECT_MEDIA_EXTENSION.test(pathOf(url));
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}
