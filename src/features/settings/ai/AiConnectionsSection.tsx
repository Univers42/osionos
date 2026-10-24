/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AiConnectionsSection.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The AI connections section of the Settings tab: the user's own model access, and
// the access tokens of the AI service. The workspaces a token may reach are the ones
// the user owns and the ones they are a member of (G4a).
import React, { useMemo } from "react";
import { useUserStore } from "@/features/auth";
import { AccessTokensPanel, type AccessTokenWorkspace } from "./AccessTokensPanel";
import { AiConnectionsPanel } from "./AiConnectionsPanel";
import { WorkspaceSkillsPanel } from "./WorkspaceSkillsPanel";
import { AiMemoryPanel } from "./AiMemoryPanel";

export const AiConnectionsSection: React.FC = () => {
  const userSession = useUserStore((s) => s.activeSession());
  const workspaces = useMemo<AccessTokenWorkspace[]>(
    () => [
      ...(userSession?.privateWorkspaces ?? []),
      ...(userSession?.sharedWorkspaces ?? []),
    ].map((workspace) => ({ id: workspace._id, name: workspace.name })),
    [userSession],
  );
  return (
    <>
      <AiConnectionsPanel />
      <AccessTokensPanel workspaces={workspaces} />
      <WorkspaceSkillsPanel workspaces={workspaces} />
      <AiMemoryPanel workspaces={workspaces} />
    </>
  );
};
