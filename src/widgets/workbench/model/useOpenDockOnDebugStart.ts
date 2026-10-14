/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useOpenDockOnDebugStart.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";
import { useDebugStore } from "@/features/ide/model/debugStore";
import { useWorkbenchStore } from "./workbenchStore";

/**
 * Opens the dock on "debug" when a Python debug run STARTS (status flips to
 * "starting" from anything else). Keyed on the transition, not the value, so
 * later store updates while starting never reopen a dock the user closed.
 */
export function useOpenDockOnDebugStart(): void {
  useEffect(
    () =>
      useDebugStore.subscribe((state, previous) => {
        if (state.status === "starting" && previous.status !== "starting") useWorkbenchStore.getState().openDock("debug");
      }),
    [],
  );
}
