/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   openOrDenyPage.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { getActivePageJwt } from '@/shared/api/client';
import { canReadPage, getCurrentPageAccessContext } from '@/shared/lib/auth/pageAccess';
import { usePageStore } from '@/store/usePageStore';

interface Options {
  /** For an approved decision: pull the (newly granted) page once. */
  fetchOnDeny?: boolean;
}

/** Opens the page when the caller can read it from the store; false when it is missing or unreadable. */
function openIfReadable(pageId: string): boolean {
  const store = usePageStore.getState();
  const index = store.pagesIndex[pageId];
  const page = index ? store.pages[index.workspaceId]?.[index.index] : undefined;
  if (!page || !canReadPage(page, getCurrentPageAccessContext())) return false;
  store.openPage({
    id: page._id,
    workspaceId: page.workspaceId,
    kind: page.databaseId ? 'database' : 'page',
    title: page.title,
    icon: page.icon,
  });
  return true;
}

/** Open a page when the caller can read it, otherwise show the no-access screen
 *  and self-heal if the page later arrives in the store (e.g. after a fetch). */
export function openOrDenyPage(pageId: string, workspaceId: string | null, options?: Options): void {
  if (openIfReadable(pageId)) return;
  const store = usePageStore.getState();
  store.setDeniedPage({ pageId, workspaceId });

  const context = getCurrentPageAccessContext();
  if (options?.fetchOnDeny && workspaceId && context?.workspaceIds?.includes(workspaceId)) {
    const jwt = getActivePageJwt();
    if (jwt) void store.fetchPages(workspaceId, jwt, true);
  }

  // No timer: the subscription lives exactly as long as this page is the denied one.
  const unsubscribe = usePageStore.subscribe((state) => {
    if (state.deniedPage?.pageId !== pageId || openIfReadable(pageId)) unsubscribe();
  });
}
