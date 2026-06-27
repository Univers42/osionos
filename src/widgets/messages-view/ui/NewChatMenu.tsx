/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NewChatMenu.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * WhatsApp-style "New chat" panel: three actions (New group / New community)
 * plus an alphabetical contact list that opens a 1:1 DM on click. Reuses the
 * shared PeoplePickerList for contacts and defers to CreateGroupModal /
 * CreateCommunityModal for the two compound flows.
 */

import React, { useState } from 'react';
import { Users, Building2 } from 'lucide-react';

import { openDm, type ChatChannel } from '@/shared/chat/channelApi';
import { PeoplePickerList } from '@/shared/people/PeoplePickerList';
import type { PersonHit } from '@/shared/people/usePeopleSearch';
import { CreateGroupModal } from '@/features/group-chat/CreateGroupModal';
import { CreateCommunityModal } from '@/features/communities/CreateCommunityModal';

interface NewChatMenuProps {
  onClose: () => void;
  onDmOpened?: (channel: ChatChannel) => void;
}

const ActionRow: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({
  icon,
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-[var(--osio-bg-hover)]"
  >
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--osio-accent-subtle)] text-[var(--osio-accent-text)]">
      {icon}
    </span>
    {label}
  </button>
);

export const NewChatMenu: React.FC<NewChatMenuProps> = ({ onClose, onDmOpened }) => {
  const [groupOpen, setGroupOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);

  const startDm = (person: PersonHit) => {
    openDm(person.id)
      .then((channel) => {
        onDmOpened?.(channel);
        onClose();
      })
      .catch(() => undefined);
  };

  return (
    <div className="grid gap-2 p-2">
      <div className="grid gap-0.5">
        <ActionRow icon={<Users size={18} />} label="New group" onClick={() => setGroupOpen(true)} />
        <ActionRow icon={<Building2 size={18} />} label="New community" onClick={() => setCommunityOpen(true)} />
      </div>
      <div className="border-t border-[var(--osio-border-default)] pt-2">
        <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-subtle)]">
          Contacts
        </p>
        <PeoplePickerList onPick={startDm} placeholder="Search contacts…" onEscape={onClose} />
      </div>
      <CreateGroupModal open={groupOpen} onClose={() => { setGroupOpen(false); onClose(); }} />
      <CreateCommunityModal open={communityOpen} onClose={() => { setCommunityOpen(false); onClose(); }} />
    </div>
  );
};
