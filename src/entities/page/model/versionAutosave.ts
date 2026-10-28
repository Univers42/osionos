/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   versionAutosave.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { usePageConfigStore } from '@/shared/config/pageConfigStore';
import { canEditPage, getCurrentPageAccessContext } from '@/shared/lib/auth/pageAccess';
import { usePageStore } from '@/store/usePageStore';

type AddVersion = ReturnType<typeof usePageConfigStore.getState>['addVersion'];

/**
 * Writes an autosave version of the page's latest state, only when the current user may
 * edit it. A reader still sees co-editors' changes arrive and bump the page revision, but
 * the config PATCH behind addVersion needs 'update' on the page: the bridge answers 403
 * every time, so skipping the call saves one refused request per autosave. The access
 * context is read once, at call time, so a role change is honoured with no subscription.
 * Returns whether a version was handed to addVersion.
 */
export function saveAutosaveVersion(
  pageId: string,
  userId: string,
  label: string,
  addVersion: AddVersion,
): boolean {
  const latest = usePageStore.getState().pageById(pageId);
  if (!latest) return false;
  if (!canEditPage(latest, getCurrentPageAccessContext())) return false;
  addVersion(userId, pageId, {
    title: latest.title || 'Untitled',
    content: latest.content ?? [],
    label,
  }).catch(() => undefined);
  return true;
}
