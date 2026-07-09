/**
 * Host integrations handed to every embedded ObjectDatabase: the workspace's
 * known people (all signed-in accounts/colleagues) feed person cells, and
 * "+ Invite" opens the Discover/collab surface to connect with someone new.
 * ponytail: collaborators = user-store sessions; widen to the people-directory
 * (bridge) roster when person cells need non-signed-in colleagues.
 */

import { useMemo } from "react";
import type { HostAdapters } from "@notion-db/object-database";
import { useUserStore } from "@/features/auth";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { collabTab } from "@/widgets/workspace-grid/model/layoutPersist";

export function useDatabaseHostAdapters(): HostAdapters {
  const personas = useUserStore((s) => s.personas);
  return useMemo(
    () => ({
      collaborators: personas
        .filter((persona) => Boolean(persona.name))
        .map((persona) => ({ id: persona.id || persona.email, name: persona.name })),
      onInvitePerson: () => {
        useWorkspaceLayout.getState().openTab(collabTab());
      },
    }),
    [personas],
  );
}
