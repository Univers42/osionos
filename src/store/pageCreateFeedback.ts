/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageCreateFeedback.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/20 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/20 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useToastStore } from "@/shared/ui/primitives/useToastStore";

/**
 * Surface a page-create failure instead of swallowing it. A silent `return null`
 * looked to the user exactly like "nothing happens" when clicking New file/page.
 * Logs for a developer and toasts a friendly, internals-free reason for the user.
 * Always returns null so callers can `return notifyCreateFailure(...)`.
 *
 * Kept in its own tiny module (no api/client import) so it stays unit-testable
 * under the canvas runner's strip-types loader, which the full pageStore.actions
 * import graph is not (api/client uses TS parameter properties).
 */
export function notifyCreateFailure(description: string, err?: unknown): null {
  if (err !== undefined) {
    console.error("addPage: create failed —", err);
  } else {
    console.error("addPage: create blocked —", description);
  }
  useToastStore.getState().push({
    kind: "error",
    title: "Couldn't create page",
    description,
  });
  return null;
}
