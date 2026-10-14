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

// The page row's icon box (SidebarNavItem): 22px, glyph at 70%.
const GLYPH_BOX = "flex h-[22px] w-[22px] shrink-0 items-center justify-center opacity-70";
// Tucks the chevron slot toward its icon: the row's gap-2 is wider than a tree wants.
const CHEVRON_SLOT = "-mr-1 w-3.5 shrink-0";

/** Page icon glyph: subscribes to the page's icon via a single primitive selector. */
function ExplorerPageGlyph({ pageId }: { pageId: string }) {
  const iconValue = usePageStore((s) => {
    const index = s.pagesIndex[pageId];
    if (!index) return undefined;
    const page = s.pages[index.workspaceId]?.[index.index];
    return page ? explorerIconValue({ icon: page.icon, databaseId: page.databaseId }) : undefined;
  });
  if (!iconValue) return <FileText size={14} />;
  return <IconValueView value={iconValue} size={14} className="shrink-0" />;
}

export const ExplorerRowIcon: React.FC<{ item: VisibleItem; open: boolean; pageId?: string }> = ({ item, open, pageId }) => {
  const { kind, name } = item.row;
  if (kind === "dir") {
    const Chevron = open ? ChevronDown : ChevronRight;
    const FolderIcon = open ? FolderOpen : Folder;
    return (
      <>
        <Chevron size={14} className={`${CHEVRON_SLOT} opacity-70`} />
        <span className={GLYPH_BOX}><FolderIcon size={14} /></span>
      </>
    );
  }
  // The empty slot keeps files aligned with folder labels.
  return (
    <>
      <span className={CHEVRON_SLOT} aria-hidden="true" />
      <span className={GLYPH_BOX}>
        {kind !== "page" && <FileCode2 size={14} style={{ color: languageForFileName(name).accent }} />}
        {kind === "page" && (pageId ? <ExplorerPageGlyph pageId={pageId} /> : <FileText size={14} />)}
      </span>
    </>
  );
};
