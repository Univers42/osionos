/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   stub-bridge.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Workspace } from '@/entities/user';

/** The bridge stamps `role` with the caller's own membership, and `ownerId` is the owner
 *  column; either one proves ownership. The members store is not consulted: it fabricates
 *  a local owner row when the roster has not loaded. */
/** When a staged delete takes effect, for the owner who may still cancel it; null otherwise. */
export function pendingDeleteFor(workspace: Pick<Workspace, 'ownerId' | 'role' | 'pendingDeleteAt' | 'deleteAfter'> | undefined, userId: string): string | null {
  if (!workspace?.pendingDeleteAt || !isWorkspaceOwner(workspace, userId)) return null;
  return workspace.deleteAfter ?? '';
}

export function isWorkspaceOwner(workspace: Pick<Workspace, 'ownerId' | 'role'> | undefined, userId: string): boolean {
  if (!workspace) return false;
  return workspace.role === 'owner' || (!!userId && workspace.ownerId === userId);
}
