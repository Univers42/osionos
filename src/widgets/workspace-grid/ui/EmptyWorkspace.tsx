/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmptyWorkspace.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 05:20:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 05:20:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// What a pane shows with nothing open, like VS Code's empty editor: a quiet
// list of ways to start, each with the keys that do it. Nothing is opened for
// the user; Home is one choice among the others.

import React from "react";
import { useShallow } from "zustand/react/shallow";
import { FilePlus2, FolderPlus, Home, Search, SquareTerminal } from "lucide-react";

import { isAutomationsEnabled } from "@/shared/config/featureFlags";
import { useAutomationStore } from "@/features/automations/model/useAutomationStore";
import { shortcutLabel } from "@/features/automations/model/shortcutLabel";
import type { CommandId } from "@/features/automations/model/types";
import { usePalette } from "@/widgets/top-bar/model/usePalette";

import { openHome, startNewFolder, startNewPage } from "../model/startActions";

interface StartAction {
  label: string;
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  run: () => void;
  commandId?: CommandId;
}

const ACTIONS: readonly StartAction[] = [
  { label: "New page", Icon: FilePlus2, run: () => void startNewPage(), commandId: "newPage" },
  { label: "New folder", Icon: FolderPlus, run: () => void startNewFolder() },
  { label: "Search pages", Icon: Search, run: () => usePalette.getState().openSearch(), commandId: "openSearch" },
  { label: "Command palette", Icon: SquareTerminal, run: () => usePalette.getState().openCommand(), commandId: "openPalette" },
  { label: "Open Home", Icon: Home, run: openHome },
];

const Keys: React.FC<{ label: string }> = ({ label }) => (
  <span className="flex shrink-0 items-center gap-1">
    {label.split(" + ").map((key) => (
      <kbd
        key={key}
        className="min-w-[1.5rem] rounded-[var(--osio-radius-chip)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-1.5 py-0.5 text-center font-sans text-xs text-[var(--osio-fg-muted)]"
      >
        {key}
      </kbd>
    ))}
  </span>
);

export const EmptyWorkspace: React.FC = () => {
  const automations = useAutomationStore(useShallow((state) => state.automations()));
  const showKeys = isAutomationsEnabled();

  return (
    <div data-testid="empty-workspace" className="flex h-full items-center justify-center overflow-auto bg-[var(--osio-bg-page)] p-6">
      <div className="w-full max-w-sm">
        <p className="mb-1 text-center text-2xl font-semibold tracking-tight text-[var(--osio-fg-subtle)]">osionos</p>
        <p className="mb-6 text-center text-sm text-[var(--osio-fg-muted)]">Nothing is open. Start something, or drop a page from the sidebar here.</p>
        <ul className="flex flex-col gap-0.5" aria-label="Start">
          {ACTIONS.map(({ label, Icon, run, commandId }) => {
            const keys = showKeys && commandId ? shortcutLabel(automations, commandId) : null;
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={run}
                  aria-keyshortcuts={keys ? keys.replaceAll(" + ", "+").replace("Ctrl", "Control") : undefined}
                  className="flex h-9 w-full items-center gap-3 rounded-[var(--osio-radius-control)] px-3 text-left text-sm text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
                >
                  <span className="text-[var(--osio-fg-muted)]"><Icon size={16} aria-hidden /></span>
                  <span className="flex-1">{label}</span>
                  {keys ? <Keys label={keys} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
