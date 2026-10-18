/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   permsPath.ts                                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** G6 F6: the bridge scopes the permission-engine reads and decide to a workspace the caller
 *  can read, so those calls carry it as `?workspaceId=` (rules already do). */
export function permsPathFor(path: string, workspaceId: string): string {
  return `${path}?workspaceId=${encodeURIComponent(workspaceId)}`;
}
