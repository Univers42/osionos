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
import React from "react";
import { AccessTokensPanel } from "./AccessTokensPanel";
import { AiConnectionsPanel } from "./AiConnectionsPanel";
import { WorkspaceSkillsPanel } from "./WorkspaceSkillsPanel";
import { AiMemoryPanel } from "./AiMemoryPanel";
import { useAiWorkspaces } from "./useAiWorkspaces";

export const AiConnectionsSection: React.FC = () => {
  const workspaces = useAiWorkspaces();
  return (
    <>
      <AiConnectionsPanel />
      <AccessTokensPanel workspaces={workspaces} />
      <WorkspaceSkillsPanel workspaces={workspaces} />
      <AiMemoryPanel workspaces={workspaces} />
    </>
  );
};
