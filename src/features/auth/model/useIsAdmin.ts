/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useIsAdmin.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useUserStore } from "./useUserStore";

/**
 * Reactive account-level administrator guard. Derives from the active session's
 * signed `is_admin` token claim, so it updates when the session changes (login,
 * switch, logout). The server is always the authoritative gate — this only
 * decides what admin-only UI surfaces (nav entry, admin space) to show.
 */
export function useIsAdmin(): boolean {
  return useUserStore((state) => state.isAdmin());
}
