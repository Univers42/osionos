/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useExportTarget.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

/**
 * Global export-open seam. The page context menu is not a mount point for the
 * Export dialog, so non-React callers (the menu's "Export") set the page here
 * and ExportHost (mounted once in App) renders the dialog for it.
 */
export interface ExportTarget {
  pageId: string;
  workspaceId: string;
}

interface ExportTargetState {
  target: ExportTarget | null;
  open: (target: ExportTarget) => void;
  close: () => void;
}

export const useExportTarget = create<ExportTargetState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
