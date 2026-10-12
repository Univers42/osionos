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

import { isWorkbenchEnabled } from "@/shared/config/featureFlags";

import { useIdeModeStore } from "./ideModeStore";
import { useSandboxHealthStore } from "./sandboxHealthStore";
import { sandboxBound, type BindingInputs } from "./sandboxBinding";

function readInputs(workspaceId: string): BindingInputs {
  const health = useSandboxHealthStore.getState();
  return {
    workbench: isWorkbenchEnabled(),
    ideMode: useIdeModeStore.getState().isIdeMode(workspaceId),
    healthState: health.state,
    healthWorkspaceId: health.workspaceId,
  };
}

/** Store-reading form for callbacks (getState(), no subscription). */
export function isSandboxBound(workspaceId: string): boolean {
  return sandboxBound(workspaceId, readInputs(workspaceId));
}

/** Hook form for render/effects: re-renders when the inputs change. */
export function useSandboxBound(workspaceId: string): boolean {
  const ideMode = useIdeModeStore((s) => s.isIdeMode(workspaceId));
  const healthState = useSandboxHealthStore((s) => s.state);
  const healthWorkspaceId = useSandboxHealthStore((s) => s.workspaceId);
  return sandboxBound(workspaceId, {
    workbench: isWorkbenchEnabled(),
    ideMode,
    healthState,
    healthWorkspaceId,
  });
}

/** Flag OFF: open the legacy IDE bottom strip (today's behaviour). Flag ON: nothing — the workbench
 *  opens its dock itself when a run is requested (useOpenDockOnRunRequest). */
export function revealTerminal(): void {
  if (isWorkbenchEnabled()) return;
  useIdeModeStore.getState().setBottomOpen(true);
}
