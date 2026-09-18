/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideRevealBus.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

/** One-slot "reveal line:col in file" hand-off (the terminalRunBus pattern):
 *  Problems/Search request, the target CodeFileView consumes once its editor
 *  exists. The request survives until the RIGHT page consumes it — a file that
 *  is still lazy-loading picks it up when the view mounts. */
export type IdeReveal = { pageId: string; line: number; col: number; seq: number };

type RevealState = {
  pending: IdeReveal | null;
  request(target: { pageId: string; line: number; col: number }): void;
  consume(pageId: string): IdeReveal | null;
};

export const useIdeRevealBus = create<RevealState>((set, get) => ({
  pending: null,
  request: (target) =>
    set((state) => ({ pending: { ...target, seq: (state.pending?.seq ?? 0) + 1 } })),
  consume: (pageId) => {
    const pending = get().pending;
    if (!pending || pending.pageId !== pageId) return null;
    set({ pending: null });
    return pending;
  },
}));
