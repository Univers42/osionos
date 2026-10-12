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
import { Plus } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";
import { canReadPage, usePageAccessContext } from "@/shared/lib/auth/pageAccess";
import type { ActivePage } from "@/entities/page";
import { PageOptionsMenu } from "@/features/page-management";
import { usePageStore } from "@/store/usePageStore";
import { SidebarNavItem } from "./SidebarNavItem";
import { selectPageAccessEntry } from "./pageAccessEntry";

interface RecentPageActionsProps {
  recent: ActivePage;
  active: boolean;
  onRedirectHome: () => void;
  onAddChild: (e: React.MouseEvent, recent: ActivePage) => void;
}

/** Options menu + "add child" button shown at the end of a recent row. */
export const RecentPageActions: React.FC<RecentPageActionsProps> = ({ recent, active, onRedirectHome, onAddChild }) => {
  const page = usePageStore(useShallow((s) => selectPageAccessEntry(s, recent.id)));
  const accessContext = usePageAccessContext();

  if (!page || !canReadPage(page, accessContext)) return null;

  return (
    <div className="flex items-center gap-0.5 mr-0.5 shrink-0">
      <PageOptionsMenu
        pageId={recent.id}
        workspaceId={recent.workspaceId}
        pageTitle={recent.title || "Untitled"}
        isActivePage={active}
        onRedirectHome={onRedirectHome}
      />
      <button
        type="button"
        className="p-1 rounded-md text-[var(--osio-fg-muted)] transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        onClick={(e) => onAddChild(e, recent)}
        title="Add child page"
      >
        <Plus size={14} />
      </button>
    </div>
  );
};

interface RecentPageRowProps {
  recent: ActivePage;
  activePageId: string | null | undefined;
  onOpenPage: (page: ActivePage) => void;
  /** Optional trailing controls; the compact Explorer strip passes none. */
  rightElement?: React.ReactNode;
}

/** One recently visited page; hidden when it is not loaded or not readable. */
export const RecentPageRow: React.FC<RecentPageRowProps> = ({ recent, activePageId, onOpenPage, rightElement }) => {
  const page = usePageStore(useShallow((s) => selectPageAccessEntry(s, recent.id)));
  const accessContext = usePageAccessContext();

  if (!page || !canReadPage(page, accessContext)) return null;

  return (
    <SidebarNavItem
      icon={<IconValueView value={recent.icon || "icon:page"} size={14} />}
      label={recent.title ?? "Untitled"}
      active={activePageId === recent.id}
      onClick={() => onOpenPage(recent)}
      rightElement={rightElement}
    />
  );
};
