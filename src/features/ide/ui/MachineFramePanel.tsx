// What a node-served frame shows while it is not connected: why, and the one thing to do next.
// Shared by the terminal in the dock, the Explorer's machine section and a file's tab.
import { Laptop, LoaderCircle } from "lucide-react";
import React from "react";

import { Button } from "@osionos/ui/atoms/Button";
import type { TerminalFramePanel } from "@/features/machines/model/terminalFrame";
import { MachineCommands } from "@/features/machines/ui/MachineCommands";
import { PairCodeField } from "@/features/machines/ui/PairCodeField";
import { openSettings } from "@/features/settings/model/settingsNav";
import { useSudoPromptStore } from "@/features/settings/ui/sudo/sudoPromptModel";
import { CODE_BUTTON, StateBlock } from "./ExplorerStates";

type Tone = "code" | "sidebar";

const PanelActions: React.FC<{ panel: TerminalFramePanel; onTryAgain: () => void; buttonClass?: string }> = ({ panel, onTryAgain, buttonClass }) => (
  <>
    {panel.confirm && <Button size="sm" tone="primary" className={buttonClass} onClick={() => useSudoPromptStore.getState().show()}>Confirm it’s me</Button>}
    {panel.download && (
      <Button size="sm" tone="primary" className={buttonClass} onClick={() => globalThis.open(panel.download ?? "", "_blank", "noopener")}>Download osionos Connector</Button>
    )}
    {panel.pair && <Button size="sm" tone="primary" className={buttonClass} onClick={() => openSettings("machines")}>Open Settings › Machines</Button>}
    {panel.tryAgain && <Button size="sm" className={buttonClass} onClick={onTryAgain}>Try again</Button>}
  </>
);

export const MachineFramePanel: React.FC<{ panel: TerminalFramePanel; waiting: boolean; pairing: boolean; onTryAgain: () => void; tone?: Tone }> = ({ panel, waiting, pairing, onTryAgain, tone = "code" }) => (
  <div role="status" aria-live="polite" className={`absolute inset-0 flex overflow-auto ${tone === "code" ? "bg-[var(--osio-code-bg)]" : ""}`}>
    <div className="m-auto w-full max-w-2xl">
      <StateBlock
        icon={waiting ? LoaderCircle : Laptop}
        title={panel.title}
        tone={tone}
        actions={<PanelActions panel={panel} onTryAgain={onTryAgain} buttonClass={tone === "code" ? CODE_BUTTON : undefined} />}
      >
        {panel.detail && <p>{panel.detail}</p>}
        {pairing && (
          <div className="mt-3 w-full space-y-3 text-left">
            <PairCodeField onPaired={onTryAgain} />
            <MachineCommands name="" />
          </div>
        )}
      </StateBlock>
    </div>
  </div>
);
