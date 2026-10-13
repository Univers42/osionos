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
// sketch on dotted paper, a greeting, and the ways to start, each with the keys
// that do it. Nothing is opened for the user; Home is one choice among others.

import React, { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { FilePlus2, FolderPlus, Home, Search, SquareTerminal } from "lucide-react";

import { useUserStore } from "@/features/auth";
import { isAutomationsEnabled } from "@/shared/config/featureFlags";
import { useAutomationStore } from "@/features/automations/model/useAutomationStore";
import { shortcutLabel } from "@/features/automations/model/shortcutLabel";
import type { Automation, CommandId } from "@/features/automations/model/types";
import { usePalette } from "@/widgets/top-bar/model/usePalette";

import { openHome, startNewFolder, startNewPage } from "../model/startActions";
import "./emptyWorkspace.css";

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

/** One tip per visit. `{keys}` is filled from the user's own binding; a tip
 *  whose command has no binding is left out. */
const TIPS: readonly { text: string; commandId?: CommandId }[] = [
  { text: "Drag a page from the sidebar onto this pane to open it here." },
  { text: "{keys} splits the pane, so two pages sit side by side.", commandId: "splitPane" },
  { text: "{keys} zooms only the pane you are in.", commandId: "zoomPaneIn" },
  { text: "{keys} hides everything but the page.", commandId: "toggleZenMode" },
];

function greeting(hour: number): string {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function pickTip(automations: readonly Automation[], showKeys: boolean, seed: number): string {
  const usable = TIPS.flatMap((tip) => {
    if (!tip.commandId) return [tip.text];
    const keys = showKeys ? shortcutLabel(automations, tip.commandId) : null;
    return keys ? [tip.text.replace("{keys}", keys)] : [];
  });
  return usable[seed % usable.length] ?? TIPS[0].text;
}

/** A sheet of paper with a few scribbled lines and a pencil, drawn in on arrival. */
const Sketch: React.FC = () => (
  <svg className="osio-empty-sketch mx-auto mb-5 block" width="168" height="120" viewBox="0 0 168 120" aria-hidden="true" focusable="false">
    <path className="osio-sketch-line" d="M40 14 Q39 60 41 106 L112 104 Q114 70 112 34 L94 14 Q66 13 40 14 Z" />
    <path className="osio-sketch-line" d="M94 14 Q95 26 93 34 Q103 35 112 34" />
    <path className="osio-sketch-line" d="M52 46 Q70 44 88 46 M52 58 Q76 57 100 58 M52 70 Q72 69 92 70" />
    <path className="osio-sketch-line" d="M52 84 Q53 90 52 95 Q57 96 62 95 Q61 89 62 84 Q57 83 52 84 M54 89 L57 92 L61 85" />
    <path className="osio-sketch-line osio-sketch-accent" d="M136 22 L137 28 M133 25 L140 25" />
    <g className="osio-sketch-pencil">
      <path className="osio-sketch-line" d="M150 50 Q127 76 104 100 L100 108 L108 105 Q131 81 154 55 Q153 51 150 50 Z" />
      <path className="osio-sketch-line osio-sketch-accent" d="M100 108 L104 100 L108 105 Z" />
    </g>
  </svg>
);

const Keys: React.FC<{ label: string }> = ({ label }) => (
  <span className="flex shrink-0 items-center gap-1">
    {label.split(" + ").map((key) => (
      <kbd
        key={key}
        className="min-w-[1.5rem] rounded-[var(--osio-radius-chip)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-1.5 py-0.5 text-center font-sans text-xs text-[var(--osio-fg-muted)] shadow-[0_1px_0_var(--osio-border-default)]"
      >
        {key}
      </kbd>
    ))}
  </span>
);

export const EmptyWorkspace: React.FC = () => {
  const automations = useAutomationStore(useShallow((state) => state.automations()));
  const firstName = useUserStore((state) => state.activePersona()?.name?.split(/\s+/)[0] ?? "");
  const showKeys = isAutomationsEnabled();
  // Fixed for the visit: the greeting and the tip do not change under the user.
  const [visit] = useState(() => ({ hour: new Date().getHours(), seed: Math.floor(Math.random() * 1000) }));
  const tip = pickTip(automations, showKeys, visit.seed);

  return (
    <div data-testid="empty-workspace" className="osio-empty-workspace flex h-full items-center justify-center overflow-auto bg-[var(--osio-bg-page)] p-6">
      <div className="w-full max-w-sm">
        <Sketch />
        <p className="text-center text-lg font-semibold tracking-tight text-[var(--osio-fg-default)]">
          {greeting(visit.hour)}{firstName ? `, ${firstName}` : ""}
        </p>
        <p className="mb-5 mt-1 text-center text-sm text-[var(--osio-fg-muted)]">Nothing is open. Start something, or pick up a page from the sidebar.</p>
        <ul className="flex flex-col gap-0.5 rounded-[var(--osio-radius-panel)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-1.5 shadow-[var(--osio-shadow-sm)]" aria-label="Start">
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
        <p className="mt-4 text-center text-xs text-[var(--osio-fg-subtle)]">{tip}</p>
      </div>
    </div>
  );
};
