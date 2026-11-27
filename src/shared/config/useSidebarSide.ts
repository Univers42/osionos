/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSidebarSide.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import { useSyncExternalStore } from "react";

import { PHONE_QUERY } from "./useResponsiveSidebar";
import { useUIStore, type SidebarSide } from "./uiStore";

function subscribePhone(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const mql = window.matchMedia(PHONE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function isPhone(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

/**
 * The side the primary side bar renders on: the stored choice, except on a
 * phone, where the drawer always opens from the left and the setting is ignored.
 */
export function useEffectiveSidebarSide(): SidebarSide {
  const stored = useUIStore((s) => s.sidebarSide);
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  return phone ? "left" : stored;
}
