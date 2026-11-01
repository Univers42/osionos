/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MachineWindowHost.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The step-up prompt for opening a machine, where the person clicked (the workbench), so opening
// it never needs a trip through Settings or /machine.
// Caveat: Settings mounts its own prompt; with Settings open and a machine waiting for its
// step-up at the same moment, both show the same prompt state twice until one is answered.
import React from "react";

import { SudoPrompt } from "@/features/settings/ui/sudo/SudoPrompt";
import { useMachineWindowStore } from "../model/machineWindowStore";

export const MachineWindowHost: React.FC = () => {
  const phase = useMachineWindowStore((state) => state.phase);
  return phase === "step-up" ? <SudoPrompt /> : null;
};
