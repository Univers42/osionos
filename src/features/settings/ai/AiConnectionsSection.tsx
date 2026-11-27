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

// The AI connections section of the Settings tab: the user's own model access, their
// MCP servers, and the access tokens of the AI service. The workspaces a token may reach are the ones
// the user owns and the ones they are a member of (G4a).
import React from "react";
import { AccessTokensPanel } from "./AccessTokensPanel";
import { AiConnectionsPanel } from "./AiConnectionsPanel";
import { McpServersSection } from "./McpServersSection";
import { useAiWorkspaces } from "./useAiWorkspaces";

export const AiConnectionsSection: React.FC = () => {
  const workspaces = useAiWorkspaces();
  return (
    <>
      <AiConnectionsPanel />
      {/* The anchor wraps the section: it renders nothing without a service, the anchor still lands. */}
      <div data-settings-anchor="mcp-servers"><McpServersSection /></div>
      <AccessTokensPanel workspaces={workspaces} />
    </>
  );
};
