import React from "react";
import { isElectronShell } from "../model/desktop";
import { WindowControls } from "./WindowControls";

/**
 * The window's chrome on screens without the top bar (signing in, the sign-in portal, the
 * handoff screen, zen): a transparent strip along the top that drags the window and holds
 * minimize / maximize / close. Electron only; Tauri draws its own bar, the web needs none.
 */
export const DesktopWindowChrome: React.FC = () => {
  if (!isElectronShell()) return null;
  return (
    <div
      data-osio-drag=""
      className="fixed inset-x-0 top-0 z-[var(--osio-z-max)] flex h-[var(--osio-topbar-h)] items-center justify-end pr-1"
    >
      <WindowControls />
    </div>
  );
};
