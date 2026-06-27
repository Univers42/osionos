/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStore.persistence.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from '@/entities/page';

export { getActivePageJwt } from '@/shared/api/client';

/**
 * Page persistence now flows through the BaaS OUTBOX (`src/store/sync/usePageSync`): it
 * subscribes to the page store, writes each change through the bridge WITH retry, and only
 * advances its ledger on confirm — so an offline edit is never lost (the previous
 * fire-and-forget PATCH here silently dropped any write that failed).
 *
 * These functions remain as no-ops to preserve the existing call sites in `usePageStore`;
 * the store mutation they follow is exactly what the outbox subscription detects and
 * persists. Keeping the seam (rather than ripping out the calls) keeps this change small
 * and reversible.
 */

type PageByIdFn = (pageId: string) => PageEntry | undefined;

/** Kept for compatibility with usePageStore; the outbox reads pages from the store. */
export function registerPageLookup(_fn: PageByIdFn) {
  // No-op: usePageSync reads pages directly from the store, so no lookup is needed here.
}

/** No-op: block content is persisted by the outbox (see usePageSync). */
export function debouncePersistContent(_pageId: string) {
  // No-op: usePageSync's store subscription detects the edit and persists it with retry.
}

/** No-op: the page title is persisted by the outbox (see usePageSync). */
export function persistPageTitle(_pageId: string, _title: string) {
  // No-op: usePageSync's store subscription detects the title change and persists it.
}
