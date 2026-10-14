/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExplorerToolbar.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { ChevronsDownUp, Download, FilePlus, FolderInput, FolderPlus, RefreshCw } from "lucide-react";
import { IconButton, PanelSectionLabel } from "@/shared/ui";

type Action = { label: string; onClick: () => void; icon: React.ReactNode };

export const ExplorerToolbar: React.FC<{
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onImportFolder?: () => void;
  onExportZip?: () => void;
}> = ({ onNewFile, onNewFolder, onRefresh, onCollapseAll, onImportFolder, onExportZip }) => {
  const actions: (Action | null)[] = [
    { label: "New file", onClick: onNewFile, icon: <FilePlus size={14} /> },
    { label: "New folder", onClick: onNewFolder, icon: <FolderPlus size={14} /> },
    onImportFolder ? { label: "Import folder", onClick: onImportFolder, icon: <FolderInput size={14} /> } : null,
    onExportZip ? { label: "Export as .zip", onClick: onExportZip, icon: <Download size={14} /> } : null,
    { label: "Collapse all", onClick: onCollapseAll, icon: <ChevronsDownUp size={14} /> },
    { label: "Refresh", onClick: onRefresh, icon: <RefreshCw size={14} /> },
  ];
  return (
    <div role="toolbar" aria-label="Workspace files actions" className="flex h-[30px] items-center gap-0.5 px-2">
      <PanelSectionLabel className="mr-auto truncate">Files</PanelSectionLabel>
      {actions.map((action) => action && (
        <IconButton key={action.label} size="xs" label={action.label} onClick={action.onClick}>{action.icon}</IconButton>
      ))}
    </div>
  );
};
