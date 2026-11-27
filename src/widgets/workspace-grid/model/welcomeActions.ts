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

// The ways to start from the empty workspace, in display order. Asking Binocle
// opens the top bar in its '/' mode, so the question is typed where every
// other entry starts.

import type React from "react";
import { FilePlus2, FolderPlus, Home, Search, Sparkles, SquareTerminal } from "lucide-react";

import type { CommandId } from "@/features/automations/model/types";
import { useZenMode } from "@/shared/config/useZenMode";
import { openAssistant } from "@/widgets/top-bar/model/agentMenu";
import { usePalette } from "@/widgets/top-bar/model/usePalette";

import { openHome, startNewFolder, startNewPage } from "./startActions";

export interface StartAction {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  run: () => void;
  commandId?: CommandId;
}

/** Zen hides the top bar, and a hidden input cannot take the caret: open the assistant itself. */
function askBinocle(): void {
  if (useZenMode.getState().zen) openAssistant();
  else usePalette.getState().openWith("/");
}

export const START_ACTIONS: readonly StartAction[] = [
  { id: "ask", label: "Ask Binocle", Icon: Sparkles, run: askBinocle },
  { id: "new-page", label: "New page", Icon: FilePlus2, run: () => void startNewPage(), commandId: "newPage" },
  { id: "new-folder", label: "New folder", Icon: FolderPlus, run: () => void startNewFolder() },
  { id: "search", label: "Search pages", Icon: Search, run: () => usePalette.getState().openSearch(), commandId: "openSearch" },
  { id: "palette", label: "Command palette", Icon: SquareTerminal, run: () => usePalette.getState().openCommand(), commandId: "openPalette" },
  { id: "home", label: "Open Home", Icon: Home, run: openHome },
];
