/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MachinesPanel.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Settings > Machines: the machines this account paired, each with its fingerprint and whether it
// is online now. One click from the app opens the default one (own-machines plan §6). Removing a
// machine needs the sudo window; a refusal opens the one prompt and the person presses again.
// A new machine is never made the default by itself (devil verdict 2026-10-31, condition 4).

import React, { useEffect, useState } from "react";
import { Laptop, Plus, Trash2 } from "lucide-react";

import { Badge, Button, IconButton } from "@/shared/ui";
import { ConfirmModal } from "@/features/settings/ui/ConfirmModals";
import { DataTable, EmptyState, PanelStatus, Section, SettingRow, type PanelStatusState } from "@/features/settings/ui/settingsKit";

import { listMachines, machineFailure, removeMachine, setDefaultMachine, type Machine } from "../api/machinesApi";
import { useMachinesStore } from "../model/machinesStore";
import { AddMachineModal } from "./AddMachineModal";
import { ForgetComputerButton } from "./ForgetComputerButton";

const HEADERS = ["Name", "Platform", "Fingerprint", "Status", "Actions"];

const StatusCell: React.FC<{ machine: Machine }> = ({ machine }) => (
  <span className="flex flex-wrap items-center gap-2">
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${machine.online ? "bg-[var(--osio-success)]" : "bg-[var(--osio-fg-subtle)]"}`} />
      {machine.online ? "Online" : "Offline"}
    </span>
    {machine.isDefault && <Badge tone="accent">Default</Badge>}
  </span>
);

export const MachinesPanel: React.FC = () => {
  const remember = useMachinesStore((state) => state.remember);
  const [status, setStatus] = useState<PanelStatusState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [adding, setAdding] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Machine | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    listMachines().then(
      (loaded) => { if (live) { setMachines(loaded); remember(loaded); setStatus("ready"); } },
      (failure: unknown) => { if (live) { setError(machineFailure(failure)); setStatus("error"); } },
    );
    return () => { live = false; };
  }, [attempt, remember]);

  function reload() {
    setStatus("loading");
    setAttempt((count) => count + 1);
  }

  async function makeDefault(machine: Machine) {
    setRowError(null);
    try {
      await setDefaultMachine(machine.id);
      reload();
    } catch (failure) {
      setRowError(machineFailure(failure));
    }
  }

  // The dialog rethrows with the friendly copy so it stays open and shows it.
  async function remove(machine: Machine) {
    try {
      await removeMachine(machine.id);
    } catch (failure) {
      throw new Error(machineFailure(failure));
    }
    reload();
  }

  const rows = machines.map((machine) => [
    <span key={machine.id} className="block truncate font-medium">{machine.name || machine.id}</span>,
    machine.platform,
    <code key="fingerprint" className="break-all text-xs">{machine.fingerprint}</code>,
    <StatusCell key="status" machine={machine} />,
    <span key="actions" className="flex items-center gap-1">
      {!machine.isDefault && <Button size="sm" onClick={() => void makeDefault(machine)}>Set default</Button>}
      <IconButton label={`Remove ${machine.name || machine.id}`} tone="danger" onClick={() => setPendingRemove(machine)}><Trash2 size={16} /></IconButton>
    </span>,
  ]);

  return (
    <Section title="Machines" anchor="machines">
      <SettingRow
        title="Your own machines"
        description="Pair a computer you own and open it from osionos: its files and its terminal stay between this browser and that machine. Adding or removing one asks you to confirm it is you."
        action={<Button tone="primary" onClick={() => setAdding(true)} disabled={status !== "ready"}><Plus size={16} />Add a machine</Button>}
      />
      <SettingRow
        title="This computer"
        description="If you chose to remember this computer, its terminal opens without an emailed code. Forget it to ask for a code again here."
        action={<ForgetComputerButton />}
      />
      {rowError && <p role="alert" className="text-sm text-[var(--osio-danger)]">{rowError}</p>}
      <PanelStatus status={status} error={error} onRetry={reload}>
        {machines.length === 0 ? (
          <EmptyState icon={<Laptop size={16} />} title="No machines yet." hint="Add a machine to open its folders and its terminal from osionos." />
        ) : (
          <DataTable headers={HEADERS} rows={rows} />
        )}
      </PanelStatus>
      {adding && <AddMachineModal onClose={() => setAdding(false)} onAdded={reload} />}
      {pendingRemove && (
        <ConfirmModal
          title="Remove machine"
          message={`Remove ${pendingRemove.name || pendingRemove.id}? It stops accepting osionos at its next check-in, every 30 seconds, and has to be paired again to come back.`}
          actionLabel="Remove"
          danger
          onConfirm={() => remove(pendingRemove)}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </Section>
  );
};
