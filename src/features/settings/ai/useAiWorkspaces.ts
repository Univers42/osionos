// The workspaces an AI access token, skill or memory may reach: the ones the user owns
// and the ones they are a member of (G4a). Shared by Settings and the AI Hub.
import { useMemo } from "react";
import { useUserStore } from "@/features/auth";
import type { AccessTokenWorkspace } from "./AccessTokensPanel";

export function useAiWorkspaces(): AccessTokenWorkspace[] {
  const userSession = useUserStore((s) => s.activeSession());
  return useMemo<AccessTokenWorkspace[]>(
    () => [
      ...(userSession?.privateWorkspaces ?? []),
      ...(userSession?.sharedWorkspaces ?? []),
    ].map((workspace) => ({ id: workspace._id, name: workspace.name })),
    [userSession],
  );
}
