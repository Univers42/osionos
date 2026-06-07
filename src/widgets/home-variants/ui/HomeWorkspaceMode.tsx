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
import { FolderRail } from "./HomeWorkspaceParts";

/**
 * The "Gallery" home variant: a folder rail (left) drives a photo gallery of the
 * files it contains (right). Both the rail and the gallery read the live
 * osionos_pages records via the workspace database adapter — no copy.
 */
export const HomeWorkspaceMode: React.FC = () => {
  return (
    <div className="flex h-full min-h-0 w-full">
      <aside className="w-64 shrink-0 overflow-auto border-r border-[var(--osio-border-default)] p-2">
        <FolderRail />
      </aside>
      <section className="min-w-0 flex-1 overflow-auto p-3">
        <WorkspaceDatabaseBlock
          databaseId={WS_FILES_DB_ID}
          initialViewId={WS_FILES_GALLERY_VIEW}
          mode="full"
        />
      </section>
    </div>
  );
};
