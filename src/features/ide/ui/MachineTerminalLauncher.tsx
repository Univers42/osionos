/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MachineTerminalLauncher.tsx                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The terminal panel where no hosted sandbox runs (owner 2026-11-01): a terminal is this
// computer's own shell, so one click opens this computer's osionos-node in its window, and the
// panel then follows that window: not running (with the command to start it), paired to another
// account, or open.
import React from "react";
import { Laptop } from "lucide-react";
import { Button } from "@/shared/ui";

import { serveCommand, thisComputerPanel } from "@/features/machines/model/machineChoice";
import { openOwnMachine, useMachineWindowStore } from "@/features/machines/model/machineWindowStore";
import { CommandLine } from "@/features/machines/ui/MachineCommands";
import { openSettings } from "@/features/settings/model/settingsNav";
import { CODE_BUTTON, StateBlock } from "./ExplorerStates";

const openThisComputer = () => { openOwnMachine(); };

const ACTION_LABEL = { open: "Open terminal", show: "Show window", "check-again": "Check again", settings: "Pair this computer" } as const;

export const MachineTerminalLauncher: React.FC = () => {
  const phase = useMachineWindowStore((state) => state.phase);
  const panel = thisComputerPanel(phase);
  const act = panel.action === "settings" ? () => openSettings("machines") : openThisComputer;
  const actions = <Button size="sm" tone="primary" className={CODE_BUTTON} onClick={act}>{ACTION_LABEL[panel.action]}</Button>;

  return (
    <div role="status" aria-live="polite" className="flex h-full w-full items-center justify-center overflow-auto bg-[var(--osio-code-bg)]">
      <StateBlock icon={Laptop} title={panel.title} tone="code" actions={actions}>
        <p>{panel.detail}</p>
        {panel.command && (
          <ul className="mt-3 text-left">
            <CommandLine label="Start osionos-node on this computer" command={serveCommand(globalThis.location.origin)} />
          </ul>
        )}
      </StateBlock>
    </div>
  );
};
