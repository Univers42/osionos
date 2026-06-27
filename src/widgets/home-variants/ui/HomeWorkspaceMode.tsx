/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   HomeWorkspaceMode.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import {
  WorkspaceDatabaseBlock,
  WS_FILES_DB_ID,
  WS_FILES_GALLERY_VIEW,
} from "@/widgets/database-view";

/**
 * The "Gallery" home surface: a cover-card gallery of the workspace's notes,
 * reading the live osionos_pages records via the workspace database adapter (no
 * copy). The folder selector lives in the Explorer sidebar (FilesPanel's gallery
 * mode → FolderRail) and scopes this gallery through the shared useWorkspaceNav
 * store — so there is ONE sidebar, not a redundant second folder rail here.
 */
export const HomeWorkspaceMode: React.FC = () => {
  return (
    <div className="h-full min-h-0 w-full overflow-auto p-3">
      <WorkspaceDatabaseBlock
        databaseId={WS_FILES_DB_ID}
        initialViewId={WS_FILES_GALLERY_VIEW}
        mode="full"
      />
    </div>
  );
};
