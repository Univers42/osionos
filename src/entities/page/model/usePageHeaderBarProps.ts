/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePageHeaderBarProps.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageHeaderBarProps } from "@/entities/page/ui/PageHeaderBar";
import { usePageStore } from "@/store/usePageStore";

/**
 * The props PageHeaderBar needs for a page, derived in ONE place so the in-page bar
 * (NotionPage) and the per-pane EditorTitleBar cannot drift. The page record wins; the
 * caller's fallback (active-page ref / tab) covers a page that has not hydrated yet.
 */
export function usePageHeaderBarProps(pageId: string, fallbackWorkspaceId?: string): PageHeaderBarProps {
  const pageWorkspaceId = usePageStore((s) => s.pageById(pageId)?.workspaceId);
  return { pageId, workspaceId: pageWorkspaceId ?? fallbackWorkspaceId ?? "" };
}
