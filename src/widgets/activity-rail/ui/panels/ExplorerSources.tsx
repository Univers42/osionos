// Separates the two places a person keeps work: the workspace in the cloud and folders on their own
// computer. Each is a section of one stack, so either can fold or take the height while the files
// opened from it stay in their tabs. The machine section is only offered in the browser: the
// desktop app reaches its disk through its own explorer (verdict F16).
import { Cloud, FolderOpen, Laptop } from "lucide-react";
import React from "react";

import { ExplorerStack, type ExplorerStackSection } from "@/features/ide/ui/ExplorerStack";
import { hasLocalTerminal } from "@/features/ide/model/localPty";
import { CLOUD_SECTION, MACHINE_SECTION, useMachineExplorer } from "@/features/machines/model/machineExplorerStore";
import { MachineExplorerSection } from "@/features/machines/ui/MachineExplorerSection";
import { IconButton } from "@osionos/ui/atoms/IconButton";
import { openMachineFolder } from "../../model/panelFocus";

type Props = { cloudName: string; children: React.ReactNode };

export const ExplorerSources: React.FC<Props> = ({ cloudName, children }) => {
  const collapsed = useMachineExplorer((state) => state.collapsed);
  const weight = useMachineExplorer((state) => state.weight);
  const toggle = useMachineExplorer((state) => state.toggle);
  const resize = useMachineExplorer((state) => state.resize);
  if (hasLocalTerminal()) return <>{children}</>;

  const sections: ExplorerStackSection[] = [
    {
      id: CLOUD_SECTION,
      title: cloudName,
      detail: "Cloud",
      icon: <Cloud size={14} />,
      collapsed: collapsed[CLOUD_SECTION],
      weight: weight[CLOUD_SECTION],
      children: <div className="flex min-h-0 w-full flex-1 flex-col">{children}</div>,
    },
    {
      id: MACHINE_SECTION,
      title: "This computer",
      icon: <Laptop size={14} />,
      actions: (
        <IconButton label="Open folder" title="Open Folder… (⌘K ⌘O)" onClick={openMachineFolder}>
          <FolderOpen size={14} aria-hidden="true" />
        </IconButton>
      ),
      collapsed: collapsed[MACHINE_SECTION],
      weight: weight[MACHINE_SECTION],
      children: <MachineExplorerSection collapsed={collapsed[MACHINE_SECTION]} />,
    },
  ];
  return <ExplorerStack sections={sections} onToggle={(id) => toggle(id as typeof CLOUD_SECTION)} onResize={(upperId, upperWeight, lowerId, lowerWeight) => resize(upperId as typeof CLOUD_SECTION, upperWeight, lowerId as typeof CLOUD_SECTION, lowerWeight)} />;
};
