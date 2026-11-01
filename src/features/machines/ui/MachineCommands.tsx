/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MachineCommands.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The commands that connect a machine, shown where the person needs them: Settings > Machines
// and the /machine empty state. They name this bridge and this app, so they can be pasted as is.

import React, { useState } from "react";
import { Copy } from "lucide-react";

import { IconButton } from "@/shared/ui";

import { machinesBridgeUrl } from "../api/machinesApi";
import { connectCommand } from "../model/machineChoice";

export const CommandLine: React.FC<{ label: string; command: string }> = ({ label, command }) => {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }
  return (
    <li className="space-y-1">
      <span className="block text-sm">{label}</span>
      <span className="flex items-start gap-1">
        <code className="min-w-0 flex-1 break-all rounded-[var(--osio-field-radius)] bg-[var(--osio-bg-subtle)] px-2 py-1.5 font-mono text-xs text-[var(--osio-fg-default)]">{command}</code>
        <IconButton label={`Copy: ${label}`} onClick={() => void copy()}><Copy size={14} /></IconButton>
      </span>
      <span role="status" className="block text-xs text-[var(--osio-fg-muted)]">{copied === "done" ? "Copied" : copied === "failed" ? "Copy failed" : ""}</span>
    </li>
  );
};

export const MachineCommands: React.FC<{ name: string }> = ({ name }) => (
  <ul>
    <CommandLine
      label="Run this on the machine and leave it running. It installs, then prints a code."
      command={connectCommand(machinesBridgeUrl(), globalThis.location.origin, name || undefined)}
    />
  </ul>
);
