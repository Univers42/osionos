import React from "react";
import { LogOut, Settings } from "lucide-react";

import { usePlatformRole, useUserStore } from "@/features/auth";
import { openSettings } from "@/features/settings/model/settingsNav";
import { useThemeSelection } from "@/features/theme/model/useThemeSelection";
import type { ThemeMode } from "@/shared/config/theme";
import { BottomSheet, type CloseSheet } from "@/shared/ui/BottomSheet";
import { RAIL_GROUPS, visibleRailItems, type RailItem } from "@/widgets/activity-rail/model/railItems";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";

const ROW = "flex min-h-11 w-full items-center gap-3 rounded-md px-4 text-left text-sm text-[var(--osio-fg-default)] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]";
const MODES: readonly { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** Light, Dark and System as one labelled group of 44px toggles. */
const ThemeRow: React.FC = () => {
  const { mode, selectMode } = useThemeSelection();
  return (
    <div role="group" aria-label="Theme" className="flex gap-2 px-4 py-2">
      {MODES.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={mode === option.value}
          onClick={() => selectMode(option.value)}
          className="min-h-11 flex-1 rounded-md border border-[var(--osio-border-default)] text-sm aria-pressed:bg-[var(--osio-bg-muted)] aria-pressed:font-semibold focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

/** The signed-in account's workspaces, the active one marked; choosing one switches and closes. */
const WorkspaceRows: React.FC<{ close: CloseSheet }> = ({ close }) => {
  const session = useUserStore((s) => s.activeSession());
  const active = useUserStore((s) => s.activeWorkspace());
  const switchWorkspace = useUserStore((s) => s.switchWorkspace);
  const workspaces = session ? [...session.privateWorkspaces, ...session.sharedWorkspaces] : [];
  if (workspaces.length < 2) return null;
  return (
    <div role="group" aria-label="Workspace" className="py-1">
      {workspaces.map((workspace) => (
        <button
          key={workspace._id}
          type="button"
          aria-current={workspace._id === active?._id ? "true" : undefined}
          onClick={() => close(() => switchWorkspace(workspace._id))}
          className={`${ROW} aria-[current=true]:font-semibold`}
        >
          {workspace.name}
        </button>
      ))}
    </div>
  );
};

/** The rail's tab-opening items (Library, Archived files, Admin, apps) the role may reach, once each. */
function tabItems(role: ReturnType<typeof usePlatformRole>): RailItem[] {
  return RAIL_GROUPS.flatMap((group) => visibleRailItems(group, role)).filter((item) => item.action.kind === "workspaceTab");
}

/** One row per rail tab item; choosing one closes the sheet, then opens that tab as a page. */
const MoreRows: React.FC<{ close: CloseSheet }> = ({ close }) => {
  const items = tabItems(usePlatformRole());
  return (
    <div role="group" aria-label="More" className="py-1">
      {items.map(({ id, label, Icon, action }) => (
        <button
          key={id}
          type="button"
          className={ROW}
          onClick={() => close(() => { if (action.kind === "workspaceTab") useWorkspaceLayout.getState().openTab(action.makeTab()); })}
        >
          <Icon size={18} aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
};

/** What a desktop user reaches through the rail and the workspace menu: settings, theme, workspace, sign out. */
export const PhoneAccountSheet: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const activeUserId = useUserStore((s) => s.activeUserId);
  const logoutUser = useUserStore((s) => s.logoutUser);
  return (
    <BottomSheet open={open} onClose={onClose} title="Account and settings">
      {(close) => (
        <div className="pb-2">
          <button type="button" className={ROW} onClick={() => close(() => openSettings())}>
            <Settings size={18} aria-hidden /> Settings
          </button>
          <MoreRows close={close} />
          <ThemeRow />
          <WorkspaceRows close={close} />
          <button
            type="button"
            className={ROW}
            disabled={!activeUserId}
            onClick={() => close(() => { if (activeUserId) void logoutUser(activeUserId); })}
          >
            <LogOut size={18} aria-hidden /> Sign out
          </button>
        </div>
      )}
    </BottomSheet>
  );
};
