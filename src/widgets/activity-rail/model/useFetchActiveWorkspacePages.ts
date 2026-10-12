/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useFetchActiveWorkspacePages.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";
import { useUserStore } from "@/features/auth";
import { usePageStore } from "@/store/usePageStore";

/** Loads the active workspace's pages whenever the workspace or token changes,
 *  and returns the pair every rail panel needs to act on them. */
export function useFetchActiveWorkspacePages(): { activeWorkspaceId: string; jwt: string } {
  const jwt = useUserStore((s) => s.activePageJwt() ?? "");
  const activeWorkspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const fetchPages = usePageStore((s) => s.fetchPages);

  useEffect(() => {
    if (activeWorkspaceId && jwt) fetchPages(activeWorkspaceId, jwt);
  }, [activeWorkspaceId, jwt, fetchPages]);

  return { activeWorkspaceId, jwt };
}
