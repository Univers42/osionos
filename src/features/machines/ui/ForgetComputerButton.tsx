// "Forget this computer", where the person meets it: the dock's terminal toolbar and Settings ›
// Machines (devil verdict 2026-11-01, Amendment 1, R8).
import { MonitorX } from "lucide-react";
import React from "react";

import { Button, Tooltip } from "@/shared/ui";
import { forgetComputerHere } from "./forgetComputerHere";

const LABEL = "Forget this computer";
const HINT = "Ask for an emailed code the next time the terminal opens here";

function useForget(): [boolean, () => void] {
  const [busy, setBusy] = React.useState(false);
  const run = () => {
    setBusy(true);
    void forgetComputerHere().finally(() => setBusy(false));
  };
  return [busy, run];
}

export const ForgetComputerIconButton: React.FC<{ className: string }> = ({ className }) => {
  const [busy, run] = useForget();
  return (
    <Tooltip label={`${LABEL}: ${HINT.toLowerCase()}`} side="bottom">
      <button type="button" aria-label={LABEL} disabled={busy} onClick={run} className={className}>
        <MonitorX size={14} />
      </button>
    </Tooltip>
  );
};

export const ForgetComputerButton: React.FC = () => {
  const [busy, run] = useForget();
  return <Button size="sm" disabled={busy} onClick={run}>{LABEL}</Button>;
};
