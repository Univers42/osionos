/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   readmePage.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { AccountProfile } from "@/shared/api/accountProfileApi";
import { useAccountProfileStore } from "@/store/settings/useAccountProfileStore";

/** Window event the inspector (P2-2-d) listens to; `detail.blockId` names the bound block. */
export const PROFILE_FIELD_SETTINGS_EVENT = "osionos:profile-field-settings";

/**
 * The one definition of "this page is the signed-in owner's README": the slash gate, the
 * dispatch re-check, the block menu and the inspector all call it. Caveat: it compares
 * against the owner's profile as the client last hydrated it, so before hydration (or
 * unavailable) it is false and the Profile field command stays hidden.
 */
export function isReadmePage(
  pageId: string | null | undefined,
  profile: Pick<AccountProfile, "readmePageId"> | null | undefined = useAccountProfileStore.getState().profile,
): boolean {
  return Boolean(pageId) && Boolean(profile?.readmePageId) && pageId === profile?.readmePageId;
}
