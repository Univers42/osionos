/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   resolveInternalPageLinkTitle.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:15:31 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:15:32 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { usePageStore } from "@/store/usePageStore";
import {
  getInternalPageLinkMetadata,
  type InternalPageLinkMetadata,
} from "./internalLinkMetadata";

export function resolveInternalPageLinkTitle(
  pageId: string,
): InternalPageLinkMetadata {
  return getInternalPageLinkMetadata(usePageStore.getState().pageById(pageId));
}
