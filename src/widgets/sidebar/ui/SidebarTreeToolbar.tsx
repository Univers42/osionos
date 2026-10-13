/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarTreeToolbar.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { FilePlus, FileCode2, FolderPlus, ChevronsDownUp, RefreshCw } from "lucide-react";
import { IconButton } from "@osionos/ui/atoms/IconButton";

interface Props {
  onAddFile: () => void;
  onAddFolder: () => void;
  /** Dev-mode only: create a line-based code file (IDE). Absent → button hidden. */
  onAddCodeFile?: () => void;
  onCollapseAll: () => void;
  onRefresh: () => void;
}

/** Section-header toolbar replacing the "⋯": add file, add folder, collapse, refresh. */
export const SidebarTreeToolbar: React.FC<Props> = ({ onAddFile, onAddFolder, onAddCodeFile, onCollapseAll, onRefresh }) => {
  const run = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <>
      <IconButton size="xs" label="Add file" title="Add file" onClick={run(onAddFile)}><FilePlus size={14} /></IconButton>
      <IconButton size="xs" label="Add folder" title="Add folder" onClick={run(onAddFolder)}><FolderPlus size={14} /></IconButton>
      {onAddCodeFile && (
        <IconButton size="xs" label="New code file" title="New code file" onClick={run(onAddCodeFile)}><FileCode2 size={14} /></IconButton>
      )}
      <IconButton size="xs" label="Collapse all" title="Collapse all" onClick={run(onCollapseAll)}><ChevronsDownUp size={14} /></IconButton>
      <IconButton size="xs" label="Refresh from database" title="Refresh from database" onClick={run(onRefresh)}><RefreshCw size={14} /></IconButton>
    </>
  );
};
