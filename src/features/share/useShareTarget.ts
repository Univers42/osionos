/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useShareTarget.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";
import type { ShareResource } from "./types";

/**
 * Global share-open seam. PageShareButton mounts its own popover locally, but
 * non-React callers (the page context menu) need a way to open the SharePopover
 * without rendering it themselves — they set a resource here and ShareHost
 * (mounted once in App) renders the popover for it.
 */
interface ShareTargetState {
  resource: ShareResource | null;
  open: (resource: ShareResource) => void;
  close: () => void;
}

export const useShareTarget = create<ShareTargetState>((set) => ({
  resource: null,
  open: (resource) => set({ resource }),
  close: () => set({ resource: null }),
}));
