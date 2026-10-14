/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExplorerRowIcon.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ChevronDown, ChevronRight, FileCode2, FileText, Folder, FolderOpen } from "lucide-react";
import { IconValueView } from "@osionos/ui/atoms/IconValueView";

import { explorerIconValue } from "../model/explorerPageIcon";
import { usePageStore } from "@/store/usePageStore";
import type { VisibleItem } from "../model/explorerRows";
import { languageForFileName } from "../model/ideLanguages";

const ICON = "shrink-0";

/** Page icon glyph: subscribes to the page's icon via a single primitive selector. */
function ExplorerPageGlyph({ pageId, size = 13 }: { pageId: string; size?: number }) {
  const iconValue = usePageStore((s) => {
    const index = s.pagesIndex[pageId];
    if (!index) return undefined;
    const page = s.pages[index.workspaceId]?.[index.index];
    return page ? explorerIconValue({ icon: page.icon, databaseId: page.databaseId }) : undefined;
  });
  if (!iconValue) return <FileText size={size} className={ICON} />;
  return <IconValueView value={iconValue} size={size} className="shrink-0" />;
}

export const ExplorerRowIcon: React.FC<{ item: VisibleItem; open: boolean; pageId?: string }> = ({ item, open, pageId }) => {
  const { kind, name } = item.row;
  if (kind === "dir") {
    const Chevron = open ? ChevronDown : ChevronRight;
    const FolderIcon = open ? FolderOpen : Folder;
    return (
      <>
        <Chevron size={14} className={`${ICON} opacity-70`} />
        <FolderIcon size={14} className={ICON} />
      </>
    );
  }
  // 14px spacer keeps files aligned with folder labels.
  return (
    <>
      <span className="w-[14px] shrink-0" aria-hidden="true" />
      {kind !== "page" && <FileCode2 size={12} className={ICON} style={{ color: languageForFileName(name).accent }} />}
      {kind === "page" && (pageId ? <ExplorerPageGlyph pageId={pageId} size={13} /> : <FileText size={12} className={ICON} />)}
    </>
  );
};
