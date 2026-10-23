/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   UsersPanel.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Users section of the Admin space. The panel renders only what the route returns, and the
 * route never returns an email, so there is no field for one. It is an affordance: the bridge
 * re-reads the admin role on every request.
 */

import React, { useEffect } from "react";
import { Users } from "lucide-react";

import type { PlatformRole } from "@/features/auth/model/platformRole";
import { useAdminUsersStore } from "@/features/admin-users/useAdminUsersStore";
import type { AdminUser, AdminUserPatch } from "@/features/admin-users/api";
import { EmptyState, PanelStatus, Section } from "@/features/settings/ui/settingsKit";
import { Button } from "@/shared/ui";
import { UserRow } from "./UserRow";

export interface UsersPanelViewProps {
  users: AdminUser[];
  roles: Record<string, PlatformRole[]>;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  hasMore: boolean;
  rowErrors: Record<string, string>;
  busyUserId: string | null;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpen: (userId: string) => void;
  onSave: (userId: string, patch: AdminUserPatch) => void;
  onRole: (userId: string, role: PlatformRole, action: "grant" | "revoke") => void;
}

export const UsersPanelView: React.FC<UsersPanelViewProps> = (props) => {
  const { users, loading, loaded, error, hasMore, onRetry, onLoadMore } = props;
  const status = !loaded ? "loading" : users.length === 0 && error ? "error" : "ready";
  return (
    <Section title="Users" className="mt-6">
      <PanelStatus status={status} error={error} onRetry={onRetry}>
        {users.length === 0 ? (
          <EmptyState icon={<Users size={16} />} title="No user yet" hint="Accounts appear here once people sign up." />
        ) : (
          <>
            {users.map((user) => (
              <UserRow key={user.userId} user={user} roles={props.roles[user.userId]} busy={props.busyUserId === user.userId}
                error={props.rowErrors[user.userId] ?? ""} onOpen={props.onOpen} onSave={props.onSave} onRole={props.onRole} />
            ))}
            {error ? <p role="alert" className="mt-3 text-sm text-[var(--osio-danger)]">{error}</p> : null}
            {hasMore ? <Button className="mt-4" disabled={loading} onClick={onLoadMore}>{loading ? "Loading…" : "Load more"}</Button> : null}
          </>
        )}
      </PanelStatus>
    </Section>
  );
};

const UsersPanel: React.FC = () => {
  const state = useAdminUsersStore();
  useEffect(() => { void useAdminUsersStore.getState().reload(); }, []);
  return (
    <UsersPanelView
      users={state.users} roles={state.roles} loading={state.loading} loaded={state.loaded} error={state.error}
      hasMore={state.nextCursor !== null} rowErrors={state.rowErrors} busyUserId={state.busyUserId}
      onRetry={() => void state.reload()} onLoadMore={() => void state.loadMore()} onOpen={(id) => void state.loadRoles(id)}
      onSave={(id, patch) => void state.saveUser(id, patch)} onRole={(id, role, action) => void state.changeRole(id, role, action)}
    />
  );
};

export default UsersPanel;
