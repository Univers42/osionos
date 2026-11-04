// "Remember this computer", in the terminal's step-up dialog (devil verdict 2026-11-01, Amendment 1,
// R6, R13): on by default (owner, 2026-11-01), with the shared-computer warning in plain words.
import React from "react";

import { useTerminalFrameStore } from "../model/terminalFrameStore";

export const RememberComputerChoice: React.FC = () => {
  const remember = useTerminalFrameStore((state) => state.remember);
  const hintId = React.useId();
  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-[var(--osio-fg-default)]">
        <input
          type="checkbox"
          checked={remember}
          aria-describedby={hintId}
          onChange={(event) => useTerminalFrameStore.setState({ remember: event.currentTarget.checked })}
          className="accent-[var(--osio-accent)]"
        />
        Remember this computer
      </label>
      <p id={hintId} className="text-xs text-[var(--osio-fg-muted)]">
        Your terminal then opens here without a code for 30 days. Don&apos;t check this on a shared computer.
      </p>
    </div>
  );
};
