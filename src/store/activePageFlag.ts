/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   activePageFlag.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { createKeyedFlag, useKeyedFlag } from "@/shared/lib/subscriptions/keyedFlag";
import { usePageStore } from "./usePageStore";

const activePageFlag = createKeyedFlag(usePageStore.subscribe, () => usePageStore.getState().activePage?.id ?? null);

/** Whether `pageId` is the open page. A navigation re-renders the two rows whose answer flips,
 *  not every row holding the active id as a prop. */
export function useIsActivePage(pageId: string): boolean {
  return useKeyedFlag(activePageFlag, pageId);
}
