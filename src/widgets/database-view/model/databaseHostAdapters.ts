/**
 * Host integrations handed to every embedded ObjectDatabase: the workspace's
 * known people (all signed-in accounts/colleagues) feed person cells, and
 * "+ Invite" opens the Discover/collab surface to connect with someone new.
 * The locked Mermaid renderer is handed over too: the kit draws a diagram only
 * through the host's renderer, never with one of its own (devil C108).
 * A dashboard widget's "Ask AI" quotes it into the Assistant, only with the
 * AI service (C424).
 * ponytail: collaborators = user-store sessions; widen to the people-directory
 * (bridge) roster when person cells need non-signed-in colleagues.
 */

import { useMemo } from "react";
import type { HostAdapters } from "@notion-db/object-database";
import { MermaidDiagram } from "@/shared/ui";
import { useUserStore } from "@/features/auth";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { collabTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { readAutofillLabels } from "./databaseAutofill";
import { dashboardAskAI } from "./dashboardAskAi";

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
      // A module-level component: the useMemo deps do not change.
      MermaidDiagram,
      // Read-only AI labels for an AI-filled select. The kit never writes them.
      autofill: { read: readAutofillLabels },
      onAskAI: dashboardAskAI(isAiConfigured()),
    }),
    [personas],
  );
}
