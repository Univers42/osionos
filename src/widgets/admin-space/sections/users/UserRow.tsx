/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   UserRow.tsx                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One user of the panel: name, directory choice, roles. "Manage" opens the editor, which can
 * change only the display name and the directory opt-out, and grant or revoke a platform role.
 * Roles are read when the editor opens (the list answer has none); a change shows once the
 * store has re-read the user.
 */

import React, { useState } from "react";

import { PLATFORM_ROLES, type PlatformRole } from "@/features/auth/model/platformRole";
import type { AdminUser, AdminUserPatch } from "@/features/admin-users/api";
import { SettingRow } from "@/features/settings/ui/settingsKit";
import { Button, Toggle } from "@/shared/ui";

export interface UserRowProps {
  user: AdminUser;
  roles: PlatformRole[] | undefined;
  busy: boolean;
  error: string;
  onOpen: (userId: string) => void;
  onSave: (userId: string, patch: AdminUserPatch) => void;
  onRole: (userId: string, role: PlatformRole, action: "grant" | "revoke") => void;
}

const fieldClass = "h-[var(--osio-control-h-md)] w-full max-w-sm rounded-[var(--osio-control-radius)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-3 text-sm text-[var(--osio-fg-default)]";

const RoleControls: React.FC<UserRowProps> = ({ user, roles, busy, onRole }) => (
  <ul className="space-y-2" aria-label={`Roles of ${user.displayName}`}>
    {PLATFORM_ROLES.map((role) => {
      const held = roles?.includes(role) ?? false;
      return (
        <li key={role} className="flex items-center justify-between gap-3 text-sm">
          <span className="capitalize">{role}{held ? " (granted)" : ""}</span>
          <Button disabled={busy || roles === undefined} onClick={() => onRole(user.userId, role, held ? "revoke" : "grant")}>
            {held ? "Revoke" : "Grant"}
          </Button>
        </li>
      );
    })}
  </ul>
);

const Editor: React.FC<UserRowProps> = (props) => {
  const { user, busy, error, onSave } = props;
  const [name, setName] = useState(user.displayName);
  const [optOut, setOptOut] = useState(user.directoryOptOut);
  const changed = name.trim() !== user.displayName || optOut !== user.directoryOptOut;

  const save = () => {
    const patch: AdminUserPatch = {};
    if (name.trim() !== user.displayName) patch.displayName = name.trim();
    if (optOut !== user.directoryOptOut) patch.directoryOptOut = optOut;
    onSave(user.userId, patch);
  };

  return (
    <div className="w-full space-y-3 pb-3">
      <label className="block text-sm text-[var(--osio-fg-muted)]">
        Display name
        <input className={`${fieldClass} mt-1 block`} value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="flex items-center gap-3 text-sm">
        <Toggle checked={optOut} onChange={setOptOut} label="Hide from the directory" />
        <span>Hide from the directory</span>
      </div>
      <Button tone="primary" disabled={busy || !changed || name.trim() === ""} onClick={save}>Save changes</Button>
      <RoleControls {...props} />
      {error ? <p role="alert" className="text-sm text-[var(--osio-danger)]">{error}</p> : null}
    </div>
  );
};

export const UserRow: React.FC<UserRowProps> = (props) => {
  const { user, roles, onOpen } = props;
  const [open, setOpen] = useState(false);
  const toggle = () => {
    if (!open) onOpen(user.userId);
    setOpen((was) => !was);
  };
  const summary = [user.username, user.directoryOptOut ? "Hidden from the directory" : null, roles?.length ? roles.join(", ") : null]
    .filter(Boolean).join(" · ");
  return (
    <>
      <SettingRow title={user.displayName || "Unnamed user"} description={summary || undefined} action={<Button onClick={toggle}>{open ? "Close" : "Manage"}</Button>} />
      {open ? <Editor key={`${user.userId}:${user.displayName}:${user.directoryOptOut}`} {...props} /> : null}
    </>
  );
};
