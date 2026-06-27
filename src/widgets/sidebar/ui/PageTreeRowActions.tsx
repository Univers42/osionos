/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PageTreeRowActions.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Plus, FolderPlus } from "lucide-react";
import { PageOptionsMenu } from "@/features/page-management";
import { usePageStore } from "@/store/usePageStore";

interface Props {
  pageId: string;
  workspaceId: string;
  title: string;
  isActive: boolean;
  onNewFolder: (e: React.MouseEvent) => void;
  onNewFile: (e: React.MouseEvent) => void;
}

/** Hover-revealed row actions: options menu, new folder, new file. */
export const PageTreeRowActions: React.FC<Props> = ({ pageId, workspaceId, title, isActive, onNewFolder, onNewFile }) => (
  <span
    className={[
      "absolute right-0 flex items-center gap-0.5 mr-0.5 shrink-0 h-full transition-opacity",
      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
    ].join(" ")}
  >
    <PageOptionsMenu
      pageId={pageId}
      workspaceId={workspaceId}
      pageTitle={title || "Untitled"}
      isActivePage={isActive}
      onRedirectHome={() => usePageStore.setState({ activePage: null, navigationPath: [] })}
    />
    <button
      type="button"
      className="p-1 rounded-md text-[var(--osio-fg-muted)] transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
      onClick={onNewFolder}
      title="New folder inside"
    >
      <FolderPlus size={14} />
    </button>
    <button
      type="button"
      className="p-1 rounded-md text-[var(--osio-fg-muted)] transition-colors duration-[120ms] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
      onClick={onNewFile}
      title="New file inside"
    >
      <Plus size={14} />
    </button>
  </span>
);
