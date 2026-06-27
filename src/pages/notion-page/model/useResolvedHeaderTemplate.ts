/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useResolvedHeaderTemplate.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useMemo } from "react";

import type { PageEntry } from "@/entities/page";
import type { HeaderTemplate } from "@/entities/page/model/headerTemplate";
import { resolveHeaderTemplate } from "@/entities/page/model/templateRegistry";
import { useHeaderTemplateStore } from "@/features/template-designer/model/headerTemplateStore";

/** Resolve a page's header template: a user-designed override wins over the built-in preset; null → classic header. */
export function useResolvedHeaderTemplate(page: PageEntry | undefined): HeaderTemplate | null {
  const databaseId = page?.databaseId ?? null;
  const override = useHeaderTemplateStore((s) => (databaseId ? s.overrides[databaseId] : undefined));
  return useMemo(() => override ?? resolveHeaderTemplate(databaseId), [override, databaseId]);
}
