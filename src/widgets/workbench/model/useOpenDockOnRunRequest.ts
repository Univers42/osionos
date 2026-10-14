/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useOpenDockOnRunRequest.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";
import { useTerminalRunBus } from "@/features/ide/model/terminalRunBus";
import { useWorkbenchStore } from "./workbenchStore";

/**
 * Opens the dock on "terminal" when a NEW run is requested (seq advanced, command
 * still parked). Keyed on seq, not on `pending`: closing the dock while a command is
 * parked must not reopen it on an unrelated bus update. The terminal drains the command.
 */
export function useOpenDockOnRunRequest(): void {
  useEffect(
    () =>
      useTerminalRunBus.subscribe((state, previous) => {
        if (state.seq > previous.seq && state.pending !== null) useWorkbenchStore.getState().openDock("terminal");
      }),
    [],
  );
}
