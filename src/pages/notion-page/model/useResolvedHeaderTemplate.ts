/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useResolvedHeaderTemplate.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useMemo } from "react";

import type { PageEntry } from "@/entities/page";
import type { HeaderTemplate } from "@/entities/page/model/headerTemplate";
import { headerScopeKeys, resolveHeaderTemplateScoped } from "@/entities/page/model/templateRegistry";
import { useHeaderTemplateStore } from "@/features/template-designer/model/headerTemplateStore";

/**
 * Resolve a page's header template through the scope chain — this page → its
 * database → global — user overrides first, then built-in presets; null →
 * classic header. Server-shared templates hydrate once per scope key.
 */
export function useResolvedHeaderTemplate(page: PageEntry | undefined): HeaderTemplate | null {
  const pageId = page?._id ?? null;
  const databaseId = page?.databaseId ?? null;
  const overrides = useHeaderTemplateStore((s) => s.overrides);

  useEffect(() => {
    const { ensureLoaded } = useHeaderTemplateStore.getState();
    for (const key of headerScopeKeys(pageId, databaseId)) ensureLoaded(key);
  }, [pageId, databaseId]);

  return useMemo(
    () => resolveHeaderTemplateScoped(overrides, pageId, databaseId),
    [overrides, pageId, databaseId],
  );
}
