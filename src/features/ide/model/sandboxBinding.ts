/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sandboxBinding.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SandboxHealthState } from "./sandboxHealthStore";

/** The two inputs `sandboxBound` needs, read from the health store. */
export interface BindingInputs {
  healthState: SandboxHealthState;
  /** The workspace the health verdict is about (null while unprobed). */
  healthWorkspaceId: string | null;
}

/**
 * Should the editor bind to the sandbox for THIS workspace? The sandbox is online
 * AND the health verdict is about this workspace (a verdict about another workspace
 * says nothing about ours). "" never binds. O(1).
 */
export function sandboxBound(workspaceId: string, inputs: BindingInputs): boolean {
  if (!workspaceId) return false;
  return inputs.healthState === "online" && inputs.healthWorkspaceId === workspaceId;
}
