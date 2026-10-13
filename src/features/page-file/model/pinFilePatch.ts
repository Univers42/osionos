/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pinFilePatch.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";

/** What a page file's front matter may change on an EXISTING page — the one rule every file
 *  write goes through (the facade's writePage: inbound apply, Take file, the explorer).
 *  The file's NAME owns the title (a rename is `mv`), the app owns the surface (a file cannot
 *  turn a block page into a folder), and who sees a page is the owner's call alone: a member
 *  who may edit the file must not be able to publish it by typing `visibility: "public"`
 *  (the bridge refuses that PATCH from a non-owner too). O(1). */
export function pinFilePatch(patch: Partial<PageEntry>, mayChangeSharing: boolean): Partial<PageEntry> {
  const pinned = { ...patch };
  delete pinned.title;
  delete pinned.surface;
  if (!mayChangeSharing) delete pinned.visibility;
  return pinned;
}
