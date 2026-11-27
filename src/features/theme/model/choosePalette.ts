/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   choosePalette.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useUserStore } from '@/features/auth';
import { applyPalette, persistPalette } from '@/shared/config/theme';
import { useWorkspaceConfigStore } from '@/shared/config/workspaceConfigStore';

/** Shows and keeps a color scheme, from Settings or from the top bar. It also
 *  drops a per-workspace appearance still stored from before palettes existed,
 *  which would otherwise paint over the chosen palette. */
export function choosePalette(id: string): void {
  applyPalette(id);
  persistPalette(id);
  const { activeUserId, activeWorkspace } = useUserStore.getState();
  const workspaceId = activeWorkspace()?._id;
  if (activeUserId && workspaceId) {
    void useWorkspaceConfigStore.getState().clearAppearance(activeUserId, workspaceId).catch(() => {});
  }
}
