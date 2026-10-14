/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embeddableUrl.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The URL an embed pane may frame, or "" when it may not. Only absolute http(s):
 *  the pane's iframe runs with `allow-scripts allow-same-origin`, and launch URLs
 *  come from marketplace rows any publisher edits — `javascript:`, `data:`, `blob:`
 *  or the app's own `app://` scheme would run with the app's privileges. O(n) in
 *  the URL length. */
export function embeddableUrl(raw: string): string {
  const trimmed = raw.trim();
  let protocol: string;
  try {
    protocol = new URL(trimmed).protocol;
  } catch {
    return ""; // relative or malformed: nothing to frame
  }
  return protocol === "http:" || protocol === "https:" ? trimmed : "";
}
