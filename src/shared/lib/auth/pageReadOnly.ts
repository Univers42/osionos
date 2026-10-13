/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageReadOnly.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import type { PageAccessContext } from "./pageAccess";
import { canEditPage } from "./pageAccess";

// Ponytail: only the page view locks; database cells and the record peek still rely on the store's write gates, so an edit there is refused silently.

/**
 * Whether the page view must open read-only: the caller's own page-config lock, or the
 * bridge refusing the PATCH the keystrokes would send. An absent page is NOT read-only —
 * the store holds nothing yet, and locking on that would flash a lock on every open.
 * O(w + p + c) — canEditPage over the caller's workspaces, the page's properties and
 * its collaborators.
 */
export function isPageReadOnly(
  page: PageEntry | undefined,
  context: PageAccessContext | null,
  configLocked: boolean,
): boolean {
  return configLocked || (page !== undefined && !canEditPage(page, context));
}
