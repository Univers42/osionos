/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   seedTarget.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Whether the online seed may post its starter pages into a workspace. Only a
 * workspace the server confirmed empty qualifies: a page list that never landed
 * (refused, outside the app session's workspace scope, still in flight) also reads
 * as empty in the store, and seeding there posted into workspaces the bridge refuses
 * ("App session is not scoped to this workspace", live 2026-10-27). PURE, because
 * pageStore.actions pulls api/client, which the canvas test loader cannot parse.
 */

import type { PageEntry } from "@/entities/page";

export function isSeedTarget(pulledAt: number | undefined, pages: readonly PageEntry[] | undefined): boolean {
  return pulledAt !== undefined && (pages ?? []).length === 0;
}
