/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   clipboardStore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

/** Cut/Copy holds a single page id + the gesture, consumed by Paste on a dir. */
export type ClipboardMode = "cut" | "copy" | null;

interface PageContextClipboard {
  pageId: string | null;
  mode: ClipboardMode;
  set: (pageId: string, mode: Exclude<ClipboardMode, null>) => void;
  clear: () => void;
}

export const usePageContextClipboard = create<PageContextClipboard>((set) => ({
  pageId: null,
  mode: null,
  set: (pageId, mode) => set({ pageId, mode }),
  clear: () => set({ pageId: null, mode: null }),
}));
