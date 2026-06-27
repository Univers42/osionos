/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   GroupMembersPanel.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Manage a group channel's roster: add members (shared PeoplePickerList),
 * remove (ConfirmDialog), and change a member's role (Menu of role chips).
 * The bridge has no GET-members route, so the roster is supplied by the
 * caller as `members`; mutations call back through `onChanged` to refetch.
 */

import React, { useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';

import { Button } from '@/shared/ui';
import { ConfirmDialog } from '@/shared/ui/molecules/ConfirmDialog';
import { Menu, MenuItem } from '@/shared/ui/primitives/Menu';
import { PeoplePickerList } from '@/shared/people/PeoplePickerList';
import { useGroupChannel } from './useGroupChannel';

export interface GroupMember {
  id: string;
  name: string;
  role: string;
}

const ROLES = ['admin', 'member'] as const;

interface Props {
  channelId: string;
  members: GroupMember[];
  onChanged?: () => void;
}

const RoleMenu: React.FC<{ member: GroupMember; onPick: (role: string) => void }> = ({ member, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
      >
        <ShieldCheck size={12} /> {member.role}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-[var(--osio-z-popover)]">
          <Menu>
            {ROLES.map((role) => (
              <MenuItem key={role} onClick={() => { onPick(role); setOpen(false); }}>
                {role}
              </MenuItem>
            ))}
          </Menu>
        </div>
      )}
    </div>
  );
};

export const GroupMembersPanel: React.FC<Props> = ({ channelId, members, onChanged }) => {
  const { busy, error, add, remove, changeRole } = useGroupChannel();
  const [adding, setAdding] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<GroupMember | null>(null);

  const after = (result: unknown) => { if (result !== null) onChanged?.(); };

  return (
    <div className="grid gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Members ({members.length})</h3>
        <Button tone="ghost" onClick={() => setAdding((value) => !value)} disabled={busy}>
          <Plus size={14} /> Add
        </Button>
      </div>

      {adding && (
        <PeoplePickerList
          onPick={(person) => add(channelId, [person.id]).then((r) => { setAdding(false); after(r); })}
          onEscape={() => setAdding(false)}
        />
      )}

      <ul className="grid gap-0.5">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--osio-bg-hover)]"
          >
            <span className="min-w-0 flex-1 truncate">{member.name}</span>
            <RoleMenu member={member} onPick={(role) => changeRole(channelId, member.id, role).then(after)} />
            <button
              type="button"
              aria-label={`Remove ${member.name}`}
              onClick={() => setPendingRemove(member)}
              className="rounded p-1 text-[var(--osio-fg-subtle)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-danger)]"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>

      {error ? <p className="text-sm text-[var(--osio-danger)]">{error}</p> : null}

      {pendingRemove && (
        <ConfirmDialog
          title="Remove member"
          confirmLabel="Remove"
          tone="danger"
          actionTone="danger"
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => {
            const member = pendingRemove;
            setPendingRemove(null);
            void remove(channelId, member.id).then(after);
          }}
        >
          <p className="text-sm text-[var(--osio-fg-muted)]">
            Remove <strong>{pendingRemove.name}</strong> from this group?
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
};
