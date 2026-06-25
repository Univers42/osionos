/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeVariantStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

export type HomeVariant = "dashboard" | "graph" | "database" | "workspace";

const STORAGE_KEY = "osionos.home.variant";
const VALID: HomeVariant[] = ["dashboard", "graph", "database", "workspace"];

const isVariant = (value: string | null): value is HomeVariant =>
  value !== null && (VALID as string[]).includes(value);

function initialVariant(): HomeVariant {
  if (globalThis.window === undefined) return "dashboard";
  // Deep-link override (?home=graph|database|workspace|dashboard) wins over the
  // persisted choice so a Home surface can be opened/linked directly.
  const linked = new URLSearchParams(globalThis.location.search).get("home");
  if (isVariant(linked)) return linked;
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  return isVariant(stored) ? stored : "dashboard";
}

interface HomeVariantState {
  variant: HomeVariant;
  setVariant: (variant: HomeVariant) => void;
}

/**
 * The active Home surface (Dashboard / Second Brain / Database / Gallery).
 * Lifted to a shared store so the top-bar Home control can switch it from any
 * page while HomeTabView renders the matching surface — instead of the picker
 * floating above the Home content.
 */
export const useHomeVariantStore = create<HomeVariantState>((set) => ({
  variant: initialVariant(),
  setVariant: (variant) => {
    if (globalThis.window !== undefined) {
      globalThis.localStorage.setItem(STORAGE_KEY, variant);
    }
    set({ variant });
  },
}));
