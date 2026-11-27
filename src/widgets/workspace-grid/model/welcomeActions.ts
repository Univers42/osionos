/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   welcomeActions.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The ways to start from the empty workspace, defined once: the action list
// and Binocle's menu both read this table.

import type React from "react";
import { Bot, FilePlus2, FolderPlus, Home, Search, SquareTerminal } from "lucide-react";

import type { CommandId } from "@/features/automations/model/types";
import { usePalette } from "@/widgets/top-bar/model/usePalette";

import { openAssistantChat, openHome, startNewFolder, startNewPage } from "./startActions";

export interface StartAction {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  run: () => void;
  commandId?: CommandId;
  inList: boolean;
  inMenu: boolean;
}

/** Every start action, in display order; `inList`/`inMenu` pick where it shows. */
export const START_ACTIONS: readonly StartAction[] = [
  { id: "assistant", label: "Ask the assistant", Icon: Bot, run: openAssistantChat, inList: false, inMenu: true },
  { id: "new-page", label: "New page", Icon: FilePlus2, run: () => void startNewPage(), commandId: "newPage", inList: true, inMenu: true },
  { id: "new-folder", label: "New folder", Icon: FolderPlus, run: () => void startNewFolder(), inList: true, inMenu: false },
  { id: "search", label: "Search pages", Icon: Search, run: () => usePalette.getState().openSearch(), commandId: "openSearch", inList: true, inMenu: true },
  { id: "palette", label: "Command palette", Icon: SquareTerminal, run: () => usePalette.getState().openCommand(), commandId: "openPalette", inList: true, inMenu: true },
  { id: "home", label: "Open Home", Icon: Home, run: openHome, inList: true, inMenu: true },
];
