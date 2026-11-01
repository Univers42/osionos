// The code a machine printed, typed where the person already is: the terminal panel.
// Going through Settings > Machines > Add a machine for it could not be found from a
// panel saying the terminal is not connected.

import React, { useState } from "react";

import { SudoPrompt } from "@/features/settings/ui/sudo/SudoPrompt";
import { Button, Input, Modal } from "@/shared/ui";

import { claimPairing, machineFailure, type PairClaim } from "../api/machinesApi";
import { normalizePairCode } from "../model/machineChoice";
import { ClaimReview } from "./AddMachineModal";

export const PairCodeField: React.FC<{ onPaired: () => void }> = ({ onPaired }) => {
  const [code, setCode] = useState("");
  const [claim, setClaim] = useState<PairClaim | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const normalized = normalizePairCode(code);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!normalized || pending) return;
    setPending(true);
    setFailure(null);
    try {
      setClaim(await claimPairing(normalized));
    } catch (error) {
      setFailure(machineFailure(error));
    }
    setPending(false);
  }

  const closeReview = () => setClaim(null);
  return (
    <form onSubmit={submit} className="space-y-1 text-left">
      <label htmlFor="machine-pair-code" className="block text-sm">Enter the code it printed</label>
      <span className="flex gap-1">
        <Input
          id="machine-pair-code" value={code} maxLength={12} placeholder="BCDF-GHJK" autoComplete="off" autoCapitalize="characters"
          onChange={(event) => setCode(event.target.value)}
        />
        <Button type="submit" tone="primary" disabled={!normalized || pending}>{pending ? "Checking…" : "Continue"}</Button>
      </span>
      {/* Approving needs the sudo window, and this panel is outside Settings, which hosts the prompt. */}
      <SudoPrompt />
      {failure && <p role="alert" className="text-sm text-[var(--osio-danger)]">{failure}</p>}
      {claim && (
        <Modal open onClose={closeReview} title="Is this your machine?" description="Your files and your terminal stay between this browser and the machine.">
          <ClaimReview claim={claim} onClose={closeReview} onApproved={() => { closeReview(); setCode(""); onPaired(); }} />
        </Modal>
      )}
    </form>
  );
};
