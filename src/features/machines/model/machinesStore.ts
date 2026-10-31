/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machinesStore.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The last machine list this tab saw, so a click (the Terminal action) can decide without a
// request: a popup opens only inside the click itself. Settings > Machines and /machine write it
// whenever they load; the workbench loads it once at start.
//
// Caveat: this is a cache. A machine paired or removed in another tab or device is not seen here
// until the next refresh, and a click before the first load finishes takes the dock's terminal.

import { create } from "zustand";

import { listMachines, type Machine } from "../api/machinesApi";

interface MachinesStore {
  machines: Machine[] | null;
  remember: (machines: Machine[]) => void;
  refresh: () => Promise<void>;
}

export const useMachinesStore = create<MachinesStore>()((set) => ({
  machines: null,
  remember: (machines) => set({ machines }),
  // A failed load leaves the last answer as it was: no server support reads as "unknown".
  refresh: async () => {
    try {
      set({ machines: await listMachines() });
    } catch {
      /* unknown is already the state a failure leaves; the Settings panel shows the error */
    }
  },
}));
