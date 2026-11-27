// "Remember this computer", in the terminal's and the editor's step-up dialogs (devil verdicts
// 2026-11-01 Amendment 1, R6, R13, and 2026-11-27 TB5): on by default (owner, 2026-11-01), with what
// it unlocks, for how long, and the shared-computer warning in plain words. `onShown` tells a frame
// that this step-up drew the box, which is what makes its checked state consent (rememberConsent.ts).
import React from "react";

import { REMEMBER_HINT } from "../model/rememberConsent";
import { useTerminalFrameStore } from "../model/terminalFrameStore";

export const RememberComputerChoice: React.FC<{ onShown?: () => void }> = ({ onShown }) => {
  const remember = useTerminalFrameStore((state) => state.remember);
  const hintId = React.useId();
  React.useEffect(() => { onShown?.(); }, [onShown]);
  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-[var(--osio-fg-default)]">
        <input name="remember-this-computer"
          type="checkbox"
          checked={remember}
          aria-describedby={hintId}
          onChange={(event) => useTerminalFrameStore.setState({ remember: event.currentTarget.checked })}
          className="accent-[var(--osio-accent)]"
        />
        Remember this computer
      </label>
      <p id={hintId} className="text-xs text-[var(--osio-fg-muted)]">
        {REMEMBER_HINT}
      </p>
    </div>
  );
};
