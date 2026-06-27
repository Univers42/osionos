/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageProperties.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback } from "react";

import type { PagePropertyEntry } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";

/**
 * Add / change / remove handlers for a page's metadata properties, persisted via the page
 * store's patchPage updater (the outbox subscription forwards each change to the BaaS).
 * Locked pages are read-only. Kept as a hook so NotionPage stays lean.
 */
export function usePageProperties(pageId: string, locked: boolean) {
  const patchPage = usePageStore((state) => state.patchPage);

  const onChangeValue = useCallback(
    (key: string, value: PagePropertyEntry["value"]) => {
      if (locked) return;
      patchPage(pageId, (current) => ({
        updatedAt: new Date().toISOString(),
        properties: (current.properties ?? []).map((property) =>
          property.key === key ? { ...property, value } : property,
        ),
      }));
    },
    [locked, pageId, patchPage],
  );

  const onAddProperty = useCallback(
    (property: PagePropertyEntry) => {
      if (locked) return;
      patchPage(pageId, (current) => ({
        updatedAt: new Date().toISOString(),
        properties: [...(current.properties ?? []), property],
      }));
    },
    [locked, pageId, patchPage],
  );

  const onRemoveProperty = useCallback(
    (key: string) => {
      if (locked) return;
      patchPage(pageId, (current) => ({
        updatedAt: new Date().toISOString(),
        properties: (current.properties ?? []).filter((property) => property.key !== key),
      }));
    },
    [locked, pageId, patchPage],
  );

  return { onChangeValue, onAddProperty, onRemoveProperty };
}
