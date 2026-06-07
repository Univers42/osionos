/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceNav.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

/** Which folder the workspace gallery is scoped to (null = all files). */
interface WorkspaceNavState {
  activeFolderId: string | null;
  setActiveFolder: (folderId: string | null) => void;
}

export const useWorkspaceNav = create<WorkspaceNavState>((set) => ({
  activeFolderId: null,
  setActiveFolder: (activeFolderId) => set({ activeFolderId }),
}));
