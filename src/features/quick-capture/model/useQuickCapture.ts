/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useQuickCapture.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

interface QuickCaptureState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** Open-state for the quick-capture modal. Opened from the top-bar button and
 *  the ⌘⇧P command; no hardcoded global chord (⌘⇧C collides with devtools). */
export const useQuickCapture = create<QuickCaptureState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
