/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   internalLinkMetadata.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:15:27 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:15:28 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "./types";

export interface InternalPageLinkMetadata {
  title: string;
  icon?: string;
}

const UNTITLED_PAGE_TITLE = "Untitled";
export const UNAVAILABLE_PAGE_LINK_TITLE = "Unavailable page";

export function getInternalPageLinkMetadata(
  page: PageEntry | null | undefined,
): InternalPageLinkMetadata {
  if (!page) {
    return { title: UNAVAILABLE_PAGE_LINK_TITLE };
  }

  return {
    title: page.title || UNTITLED_PAGE_TITLE,
    icon: page.icon,
  };
}
