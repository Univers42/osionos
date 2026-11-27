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

// What a pane shows with nothing open, like VS Code's empty editor: a greeting,
// then two columns, the ways to start (each with its keys) and the pages
// visited last. Nothing is opened for the user. Asking Binocle starts in the
// top bar, the app's one entry point, not in a field of its own here.

import React, { useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useUserStore } from "@/features/auth";
import { isAutomationsEnabled } from "@/shared/config/featureFlags";
import { useAutomationStore } from "@/features/automations/model/useAutomationStore";
import { shortcutLabel } from "@/features/automations/model/shortcutLabel";
import type { Automation, CommandId } from "@/features/automations/model/types";
import { greetingFor } from "@/shared/lib/date/greeting";
import { BinocleMascot } from "@/shared/ui/mascot/BinocleMascot";

import { START_ACTIONS } from "../model/welcomeActions";
import { WelcomeRecents } from "./WelcomeRecents";
import "./emptyWorkspace.css";

const HEADING = "mb-1 px-3 text-xs font-medium text-[var(--osio-fg-subtle)]";

/** One tip per visit. `{keys}` is filled from the user's own binding; a tip
 *  whose command has no binding is left out. */
const TIPS: readonly { text: string; commandId?: CommandId }[] = [
  { text: "Drag a page from the sidebar onto this pane to open it here." },
  { text: "{keys} splits the pane, so two pages sit side by side.", commandId: "splitPane" },
  { text: "{keys} zooms only the pane you are in.", commandId: "zoomPaneIn" },
  { text: "{keys} hides everything but the page.", commandId: "toggleZenMode" },
];

function pickTip(automations: readonly Automation[], showKeys: boolean, seed: number): string {
  const usable = TIPS.flatMap((tip) => {
    if (!tip.commandId) return [tip.text];
    const keys = showKeys ? shortcutLabel(automations, tip.commandId) : null;
    return keys ? [tip.text.replace("{keys}", keys)] : [];
  });
  return usable[seed % usable.length] ?? TIPS[0].text;
}

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

const StartList: React.FC<{ automations: readonly Automation[]; showKeys: boolean }> = ({ automations, showKeys }) => {
  const headingId = React.useId();
  return (
  <section aria-labelledby={headingId}>
    <h2 id={headingId} className={HEADING}>Start</h2>
    <ul className="flex flex-col gap-px">
      {START_ACTIONS.map(({ id, label, Icon, run, commandId }) => {
        const keys = showKeys && commandId ? shortcutLabel(automations, commandId) : null;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={run}
              aria-keyshortcuts={keys ? keys.replaceAll(" + ", "+").replace("Ctrl", "Control") : undefined}
              className="flex h-8 w-full items-center gap-3 rounded-[var(--osio-radius-control)] px-3 text-left text-sm text-[var(--osio-fg-default)] transition-colors hover:bg-[var(--osio-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)]"
            >
              <span className="text-[var(--osio-fg-muted)]"><Icon size={16} aria-hidden /></span>
              <span className="flex-1">{label}</span>
              {keys ? <Keys label={keys} /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  </section>
  );
};

export const EmptyWorkspace: React.FC = () => {
  const automations = useAutomationStore(useShallow((state) => state.automations()));
  const firstName = useUserStore((state) => state.activePersona()?.name?.split(/\s+/)[0] ?? "");
  const showKeys = isAutomationsEnabled();
  // Fixed for the visit: the greeting and the tip do not change under the user.
  const [visit] = useState(() => ({ hour: new Date().getHours(), seed: Math.floor(Math.random() * 1000) }));
  const tip = pickTip(automations, showKeys, visit.seed);

  return (
    <div data-testid="empty-workspace" className="osio-empty-workspace flex h-full items-center justify-center overflow-auto p-6">
      <div className="osio-welcome-card w-full">
        <div className="osio-welcome-head">
          <BinocleMascot size={64} mood="curious" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--osio-fg-default)]">
              {greetingFor(visit.hour)}{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-0.5 text-sm text-[var(--osio-fg-muted)]">What would you like to work on?</p>
          </div>
        </div>
        <div className="osio-welcome-columns">
          <StartList automations={automations} showKeys={showKeys} />
          <WelcomeRecents headingClass={HEADING} />
        </div>
        <p className="mt-5 text-center text-xs text-[var(--osio-fg-subtle)]">{tip}</p>
      </div>
    </div>
  );
};
