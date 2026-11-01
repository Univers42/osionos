/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AddMachineModal.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// "Add a machine": the commands to run on it, then the code it printed. Claiming the code shows
// what the machine said about itself (name, platform, fingerprint) so the person compares the
// fingerprint with the machine's screen before approving (devil verdict 2026-10-31, condition 4).
// The code is consumed by the claim, so a mistyped or stolen code cannot be retried here: the
// machine starts a new one. Claim and approve need the sudo window; a refusal opens the one prompt
// and the person presses the button again.

import React, { useId, useState } from "react";

import { Button, Input, Modal } from "@/shared/ui";

import { approvePairing, claimPairing, declinePairing, machineFailure, type PairClaim } from "../api/machinesApi";
import { normalizePairCode, pairWarning } from "../model/machineChoice";
import { MachineCommands } from "./MachineCommands";

const labelClass = "block text-sm font-medium text-[var(--osio-fg-default)]";
const hintClass = "text-sm leading-[18px] text-[var(--osio-fg-muted)]";

const ClaimForm: React.FC<{ onClaimed: (claim: PairClaim) => void; onClose: () => void }> = ({ onClaimed, onClose }) => {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const nameId = useId();
  const codeId = useId();
  const normalized = normalizePairCode(code);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!normalized || pending) return;
    setPending(true);
    setFailure(null);
    try {
      onClaimed(await claimPairing(normalized));
    } catch (error) {
      setFailure(machineFailure(error));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 p-6">
      <div className="space-y-1">
        <label htmlFor={nameId} className={labelClass}>Machine name</label>
        <Input id={nameId} value={name} maxLength={64} placeholder="my-laptop" onChange={(event) => setName(event.target.value)} />
        <p className={hintClass}>Only used in the command below; the machine sends it when it pairs.</p>
      </div>
      <MachineCommands name={name.trim()} />
      <div className="space-y-1">
        <label htmlFor={codeId} className={labelClass}>Code shown on the machine</label>
        <Input
          id={codeId} value={code} maxLength={12} placeholder="BCDF-GHJK" autoComplete="off" autoCapitalize="characters" spellCheck={false}
          onChange={(event) => setCode(event.target.value)}
        />
      </div>
      {failure && <p role="alert" className="text-sm text-[var(--osio-danger)]">{failure}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={pending}>Cancel</Button>
        <Button type="submit" tone="primary" disabled={!normalized || pending}>{pending ? "Checking…" : "Continue"}</Button>
      </div>
    </form>
  );
};

export const ClaimReview: React.FC<{ claim: PairClaim; onApproved: () => void; onClose: () => void }> = ({ claim, onApproved, onClose }) => {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const warning = pairWarning(claim);

  async function act(run: () => Promise<unknown>, after: () => void) {
    setPending(true);
    setFailure(null);
    try {
      await run();
      after();
    } catch (error) {
      setFailure(machineFailure(error));
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 p-6">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-[var(--osio-fg-muted)]">Name</dt><dd className="break-all font-medium">{claim.name}</dd>
        <dt className="text-[var(--osio-fg-muted)]">Platform</dt><dd>{claim.platform}</dd>
        <dt className="text-[var(--osio-fg-muted)]">Fingerprint</dt><dd><code className="break-all font-mono text-xs">{claim.fingerprint}</code></dd>
      </dl>
      <p className={hintClass}>Approve only if this fingerprint is the one the machine printed.</p>
      {warning && <p role="alert" className="rounded-[var(--osio-radius-panel)] border border-[var(--osio-warning)] bg-[var(--osio-bg-subtle)] p-3 text-sm text-[var(--osio-fg-default)]">{warning}</p>}
      {failure && <p role="alert" className="text-sm text-[var(--osio-danger)]">{failure}</p>}
      <div className="flex justify-end gap-2">
        <Button disabled={pending} onClick={() => void act(() => declinePairing(claim.pairId), onClose)}>Decline</Button>
        <Button tone="primary" disabled={pending} onClick={() => void act(() => approvePairing(claim.pairId), onApproved)}>{pending ? "Working…" : "Approve"}</Button>
      </div>
    </div>
  );
};

export const AddMachineModal: React.FC<{ onClose: () => void; onAdded: () => void }> = ({ onClose, onAdded }) => {
  const [claim, setClaim] = useState<PairClaim | null>(null);
  return (
    <Modal open onClose={onClose} title={claim ? "Is this your machine?" : "Add a machine"} description="Your files and your terminal stay between this browser and the machine." size="md">
      {claim
        ? <ClaimReview claim={claim} onClose={onClose} onApproved={() => { onAdded(); onClose(); }} />
        : <ClaimForm onClaimed={setClaim} onClose={onClose} />}
    </Modal>
  );
};
