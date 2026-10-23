/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAdminUsersStore.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The users panel's state: the rows loaded so far, the keyset cursor, and the roles read per
 * user. "Load more" appends from `nextCursor`. A write never patches a row in place: the user
 * is read again from the bridge and the answer replaces the row, so the panel shows what the
 * server holds. Roles are not in the list answer, so they are read per user, on demand.
 *
 * Caveat: `epoch` drops a late page after a reload, but two writes on different rows at once
 * share `busyUserId`, so the later one hides the earlier one's busy state.
 */

import { create } from "zustand";

import type { PlatformRole } from "@/features/auth/model/platformRole";
import { adminUsersErrorCopy } from "./adminUsersCopy";
import {
  changeAdminUserRole,
  getAdminUser,
  listAdminUsers,
  updateAdminUser,
  type AdminUser,
  type AdminUserPatch,
} from "./api";

const PAGE_SIZE = 25;

interface AdminUsersState {
  users: AdminUser[];
  roles: Record<string, PlatformRole[]>;
  nextCursor: string | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  rowErrors: Record<string, string>;
  busyUserId: string | null;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadRoles: (userId: string) => Promise<void>;
  saveUser: (userId: string, patch: AdminUserPatch) => Promise<void>;
  changeRole: (userId: string, role: PlatformRole, action: "grant" | "revoke") => Promise<void>;
}

let epoch = 0;

export const useAdminUsersStore = create<AdminUsersState>((set, get) => {
  async function fetchPage(cursor: string | null, replace: boolean): Promise<void> {
    const mine = ++epoch;
    set({ loading: true, error: null });
    try {
      const page = await listAdminUsers({ limit: PAGE_SIZE, cursor });
      if (mine !== epoch) return;
      set((state) => ({ users: replace ? page.users : [...state.users, ...page.users], nextCursor: page.nextCursor, loading: false, loaded: true }));
    } catch (error) {
      if (mine !== epoch) return;
      set({ loading: false, loaded: true, error: adminUsersErrorCopy(error) });
    }
  }

  /** Re-reads one user and replaces the row; the write above it is never trusted as the new state. */
  async function reread(userId: string): Promise<void> {
    const { user, roles } = await getAdminUser(userId);
    set((state) => ({
      users: state.users.map((row) => (row.userId === userId ? user : row)),
      roles: { ...state.roles, [userId]: roles },
    }));
  }

  async function write(userId: string, action: () => Promise<void>): Promise<void> {
    set((state) => ({ busyUserId: userId, rowErrors: { ...state.rowErrors, [userId]: "" } }));
    try {
      await action();
      await reread(userId);
    } catch (error) {
      set((state) => ({ rowErrors: { ...state.rowErrors, [userId]: adminUsersErrorCopy(error) } }));
    } finally {
      set({ busyUserId: null });
    }
  }

  return {
    users: [], roles: {}, nextCursor: null, loading: false, loaded: false, error: null, rowErrors: {}, busyUserId: null,
    reload: () => fetchPage(null, true),
    loadMore: async () => {
      const { nextCursor, loading } = get();
      if (!nextCursor || loading) return;
      await fetchPage(nextCursor, false);
    },
    loadRoles: async (userId) => {
      try {
        await reread(userId);
      } catch (error) {
        set((state) => ({ rowErrors: { ...state.rowErrors, [userId]: adminUsersErrorCopy(error) } }));
      }
    },
    saveUser: (userId, patch) => write(userId, () => updateAdminUser(userId, patch)),
    changeRole: (userId, role, action) => write(userId, () => changeAdminUserRole(userId, role, action)),
  };
});
