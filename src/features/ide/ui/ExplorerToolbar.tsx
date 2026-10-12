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
import { FilePlus, FolderPlus, RefreshCw } from "lucide-react";

const TOOL = "flex h-6 w-6 items-center justify-center rounded text-[var(--osio-code-fg-muted)] hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--osio-accent)]";

export const ExplorerToolbar: React.FC<{ onNewFile: () => void; onNewFolder: () => void; onRefresh: () => void }> = ({ onNewFile, onNewFolder, onRefresh }) => (
  <div role="toolbar" aria-label="Workspace files actions" className="flex items-center justify-end gap-0.5 px-2 py-1">
    <button type="button" title="New file" aria-label="New file" onClick={onNewFile} className={TOOL}><FilePlus size={14} /></button>
    <button type="button" title="New folder" aria-label="New folder" onClick={onNewFolder} className={TOOL}><FolderPlus size={14} /></button>
    <button type="button" title="Refresh" aria-label="Refresh" onClick={onRefresh} className={TOOL}><RefreshCw size={13} /></button>
  </div>
);
