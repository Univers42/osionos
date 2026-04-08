/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStore.persistence.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 03:57:43 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { api } from '../api/client';
import { isMongoId } from './pageStore.helpers';
import type { PageEntry } from './pageStore.types';

/** Lazy JWT getter — avoids importing useUserStore at module top level */
export function getActiveJwt(): string | null {
  try {
    const mod = (globalThis as unknown as Record<string, unknown>).__playgroundUserStore as
      | { getState: () => { activeJwt: () => string | null } }
      | undefined;
    if (!mod) return null;
    return mod.getState().activeJwt() || null;
  } catch {
    return null;
  }
}

type PageByIdFn = (pageId: string) => PageEntry | undefined;
let _pageByIdFn: PageByIdFn | null = null;

/** Register the store's pageById accessor (called once from usePageStore). */
export function registerPageLookup(fn: PageByIdFn) {
  _pageByIdFn = fn;
}

const _contentTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function debouncePersistContent(pageId: string) {
  const existing = _contentTimers.get(pageId);
  if (existing) clearTimeout(existing);

  _contentTimers.set(pageId, setTimeout(() => {
    _contentTimers.delete(pageId);
    persistPageContent(pageId);
  }, 400));
}

/** Flush all pending debounced saves immediately (used on page unload) */
function flushPendingPersists() {
  for (const [pageId, timer] of _contentTimers.entries()) {
    clearTimeout(timer);
    _contentTimers.delete(pageId);
    if (!isMongoId(pageId)) continue;  // offline seed page — skip API call
    // Use registered lookup instead of direct store import (avoids circular dep)
    const page = _pageByIdFn?.(pageId);
    if (!page?.content) continue;
    const jwt = getActiveJwt();
    if (!jwt) continue;
    const url = `${(import.meta.env as Record<string, string>)['VITE_API_URL'] ?? 'http://localhost:4000'}/api/pages/${pageId}`;
    // sendBeacon doesn't support custom headers — fall back to sync XHR
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('PATCH', url, false); // synchronous
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${jwt}`);
      xhr.send(JSON.stringify({ content: page.content }));
      console.log('[persist] flush: synced', pageId, 'status', xhr.status);
    } catch (err) {
      console.warn('[persist] flush failed for', pageId, err);
    }
  }
}

// Flush pending saves on page unload (refresh / tab close)
if (globalThis.window !== undefined) {
  globalThis.addEventListener('beforeunload', flushPendingPersists);
}

async function persistPageContent(pageId: string) {
  if (!isMongoId(pageId)) return;  // offline seed page — skip API call
  const page = _pageByIdFn?.(pageId);
  if (!page?.content) return;

  const jwt = getActiveJwt();
  if (!jwt) return;

  try {
    await api.patch(`/api/pages/${pageId}`, { content: page.content }, jwt);
  } catch (err) {
    console.error('[persist] PATCH failed for', pageId, err);
  }
}

export async function persistPageTitle(pageId: string, title: string) {
  if (!isMongoId(pageId)) return;  // offline seed page — skip API call
  const jwt = getActiveJwt();
  if (!jwt) return;
  try {
    await api.patch(`/api/pages/${pageId}`, { title }, jwt);
  } catch (err) {
    console.error('[persist] title PATCH failed for', pageId, err);
  }
}
