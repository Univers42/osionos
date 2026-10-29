/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   commentsPanelStore.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/29 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

export interface CommentsPanelRequest {
  pageId: string;
  blockId: string;
}

interface CommentsPanelState {
  /** A request from the editor to open the page's comments on one block. */
  request: CommentsPanelRequest | null;
  openFor: (pageId: string, blockId: string) => void;
  clear: () => void;
}

/** The selection toolbar asks the page header's comments panel to open on a block. */
export const useCommentsPanelStore = create<CommentsPanelState>((set) => ({
  request: null,
  openFor: (pageId, blockId) => set({ request: { pageId, blockId } }),
  clear: () => set({ request: null }),
}));
