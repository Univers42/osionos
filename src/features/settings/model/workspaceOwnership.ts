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
export function isWorkspaceOwner(workspace: Pick<Workspace, 'ownerId' | 'role'> | undefined, userId: string): boolean {
  if (!workspace) return false;
  return workspace.role === 'owner' || (!!userId && workspace.ownerId === userId);
}
