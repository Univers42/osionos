/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   renderMode.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { createContext, useContext } from "react";
import type { RenderMode } from "@/entities/block/model/buttonEffect";
export type { RenderMode };

export const RenderModeContext = createContext<RenderMode>("preview");

export const RenderModeProvider: React.FC<{
  mode: RenderMode;
  children: React.ReactNode;
}> = ({ mode, children }) => (
  <RenderModeContext.Provider value={mode}>{children}</RenderModeContext.Provider>
);

export function useRenderMode(): RenderMode {
  return useContext(RenderModeContext);
}
