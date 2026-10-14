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

const TOOL = "flex h-6 w-6 items-center justify-center rounded text-[var(--osio-code-fg-muted)] hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--osio-accent)]";

export const ExplorerToolbar: React.FC<{
  onNewFile: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onImportFolder?: () => void;
  onExportZip?: () => void;
}> = ({ onNewFile, onNewFolder, onRefresh, onCollapseAll, onImportFolder, onExportZip }) => (
  <div role="toolbar" aria-label="Workspace files actions" className="flex items-center justify-end gap-0.5 px-2 py-1">
    <button type="button" title="New file" aria-label="New file" onClick={onNewFile} className={TOOL}><FilePlus size={14} /></button>
    <button type="button" title="New folder" aria-label="New folder" onClick={onNewFolder} className={TOOL}><FolderPlus size={14} /></button>
    {onImportFolder && <button type="button" title="Import folder" aria-label="Import folder" onClick={onImportFolder} className={TOOL}><FolderInput size={14} /></button>}
    {onExportZip && <button type="button" title="Export as .zip" aria-label="Export as .zip" onClick={onExportZip} className={TOOL}><Download size={14} /></button>}
    <button type="button" title="Collapse all" aria-label="Collapse all" onClick={onCollapseAll} className={TOOL}><ChevronsDownUp size={14} /></button>
    <button type="button" title="Refresh" aria-label="Refresh" onClick={onRefresh} className={TOOL}><RefreshCw size={13} /></button>
  </div>
);
