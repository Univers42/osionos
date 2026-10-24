/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePlatformRole.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useUserStore } from "./useUserStore";
import type { PlatformRole } from "@/entities/user";

/**
 * Reactive platform role of the signed-in user. It follows the active session's signed
 * `platform_role` claim, so it updates when the session changes (login, switch, logout).
 * The server is always the authoritative gate — this only decides which surfaces the app
 * offers to someone who has the role.
 */
export function usePlatformRole(): PlatformRole | null {
  return useUserStore((state) => state.platformRole());
}
