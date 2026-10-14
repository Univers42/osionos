/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   RecentPageRow.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { useShallow } from "zustand/react/shallow";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";
import { canReadPage, usePageAccessContext } from "@/shared/lib/auth/pageAccess";
import type { ActivePage } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";
import { SidebarNavItem } from "./SidebarNavItem";
import { selectPageAccessEntry } from "../model/pageAccessEntry";

interface RecentPageRowProps {
  recent: ActivePage;
  activePageId: string | null | undefined;
  onOpenPage: (page: ActivePage) => void;
}

/** One recently visited page; hidden when it is not loaded or not readable. */
export const RecentPageRow: React.FC<RecentPageRowProps> = ({ recent, activePageId, onOpenPage }) => {
  const page = usePageStore(useShallow((s) => selectPageAccessEntry(s, recent.id)));
  const accessContext = usePageAccessContext();

  if (!page || !canReadPage(page, accessContext)) return null;

  return (
    <SidebarNavItem
      icon={<IconValueView value={recent.icon || "icon:page"} size={14} />}
      label={recent.title ?? "Untitled"}
      active={activePageId === recent.id}
      onClick={() => onOpenPage(recent)}
    />
  );
};
