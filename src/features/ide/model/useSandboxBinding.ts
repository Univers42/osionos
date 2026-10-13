/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSandboxBinding.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useSandboxHealthStore } from "./sandboxHealthStore";
import { sandboxBound, type BindingInputs } from "./sandboxBinding";

function readInputs(): BindingInputs {
  const health = useSandboxHealthStore.getState();
  return {
    healthState: health.state,
    healthWorkspaceId: health.workspaceId,
  };
}

/** Store-reading form for callbacks (getState(), no subscription). */
export function isSandboxBound(workspaceId: string): boolean {
  return sandboxBound(workspaceId, readInputs());
}

/** Hook form for render/effects: re-renders when the inputs change. */
export function useSandboxBound(workspaceId: string): boolean {
  const healthState = useSandboxHealthStore((s) => s.state);
  const healthWorkspaceId = useSandboxHealthStore((s) => s.workspaceId);
  return sandboxBound(workspaceId, {
    healthState,
    healthWorkspaceId,
  });
}
