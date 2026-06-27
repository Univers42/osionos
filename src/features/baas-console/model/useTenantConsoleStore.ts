/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useTenantConsoleStore.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from "zustand";

import { tenantConsoleClient } from "./tenantConsoleClient";
import type { ApiKey, IssueKeyResponse, MeResponse, UsageResponse } from "./tenantConsoleTypes";

const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
/** Parity gate: a build without the BaaS env exposes nothing new. */
const CONFIGURED = Boolean(env.VITE_BAAS_URL && env.VITE_BAAS_API_KEY);

function errorOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface TenantConsoleStore {
  configured: boolean;
  me: MeResponse | null;
  usage: UsageResponse | null;
  keys: ApiKey[];
  loading: boolean;
  error: string | null;
  lastIssuedKey: IssueKeyResponse | null;
  hydrate: () => Promise<void>;
  fetchUsage: () => Promise<void>;
  createKey: (name: string, scopes?: string[]) => Promise<IssueKeyResponse | null>;
  revokeKey: (id: string) => Promise<void>;
  changePlan: (plan: string) => Promise<void>;
  clearLastIssuedKey: () => void;
}

export const useTenantConsoleStore = create<TenantConsoleStore>((set, get) => ({
  configured: CONFIGURED,
  me: null,
  usage: null,
  keys: [],
  loading: false,
  error: null,
  lastIssuedKey: null,

  hydrate: async () => {
    if (!get().configured) return;
    set({ loading: true, error: null });
    try {
      const [me, keys] = await Promise.all([
        tenantConsoleClient.getSelf(),
        tenantConsoleClient.listKeys(),
      ]);
      set({ me, keys, loading: false });
    } catch (error) {
      set({ loading: false, error: errorOf(error) });
    }
  },

  fetchUsage: async () => {
    if (!get().configured) return;
    set({ error: null });
    try {
      set({ usage: await tenantConsoleClient.getUsage() });
    } catch (error) {
      set({ error: errorOf(error) });
    }
  },

  createKey: async (name, scopes) => {
    if (!get().configured) return null;
    set({ error: null });
    try {
      const issued = await tenantConsoleClient.createKey(name, scopes);
      set((state) => ({ keys: [issued, ...state.keys], lastIssuedKey: issued }));
      return issued;
    } catch (error) {
      set({ error: errorOf(error) });
      return null;
    }
  },

  revokeKey: async (id) => {
    if (!get().configured) return;
    const previous = get().keys;
    set({ keys: previous.filter((key) => key.id !== id), error: null });
    try {
      await tenantConsoleClient.revokeKey(id);
    } catch (error) {
      set({ keys: previous, error: errorOf(error) });
    }
  },

  changePlan: async (plan) => {
    if (!get().configured) return;
    set({ error: null });
    try {
      const result = await tenantConsoleClient.changePlan(plan);
      set((state) => ({ me: state.me ? { ...state.me, tenant: result.tenant } : state.me }));
      await get().hydrate();
    } catch (error) {
      set({ error: errorOf(error) });
    }
  },

  clearLastIssuedKey: () => set({ lastIssuedKey: null }),
}));
