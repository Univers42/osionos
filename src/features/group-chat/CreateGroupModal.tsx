/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CreateGroupModal.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Create-group dialog: name + optional icon + multi-select members (shared
 * PeoplePickerList), then groupApi.createGroup and open the new channel as a
 * `group` tab. The thread itself is the existing ChannelMessagesView pane.
 */

import React, { useState } from 'react';

import type { ChatChannel } from '@/shared/chat/channelApi';
import { Button, EmojiPicker, IconValueView, Input } from '@/shared/ui';
import { Modal } from '@/shared/ui/primitives/Modal';
import { PeoplePickerList } from '@/shared/people/PeoplePickerList';
import { genId } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { useGroupChannel } from './useGroupChannel';

function openGroupTab(channel: ChatChannel, icon?: string) {
  useWorkspaceLayout.getState().openTab({
    tabId: genId('tab'),
    pageId: channel.id,
    workspaceId: channel.workspaceId,
    kind: 'group',
    title: channel.name,
    icon: icon ?? 'icon:users',
  });
}

const IconTrigger: React.FC<{ icon?: string; onChange: (value?: string) => void }> = ({ icon, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Choose group icon"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-lg hover:bg-[var(--osio-bg-hover)]"
      >
        {icon ? <IconValueView value={icon} size={20} /> : '🙂'}
      </button>
      {open && (
        <EmojiPicker
          current={icon}
          onSelect={(value) => onChange(value)}
          onRemove={() => onChange(undefined)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

const CreateGroupForm: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const { busy, error, create } = useGroupChannel();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || selected.size === 0) return;
    const channel = await create({ name: name.trim(), memberIds: [...selected], avatar: icon });
    if (!channel) return;
    openGroupTab(channel, icon);
    onCreated();
  };

  return (
    <form onSubmit={submit} className="grid gap-4 p-5">
      <h3 className="text-base font-semibold">New group</h3>
      <div className="flex items-center gap-3">
        <IconTrigger icon={icon} onChange={setIcon} />
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Group name"
          autoFocus
          required
          className="flex-1"
        />
      </div>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--osio-fg-muted)]">
          Members ({selected.size} selected)
        </span>
        <PeoplePickerList
          multiSelect
          selected={selected}
          onPick={(person) => toggle(person.id)}
          autoFocus={false}
        />
      </div>
      {error ? <p className="text-sm text-[var(--osio-danger)]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="submit" tone="primary" disabled={busy || !name.trim() || selected.size === 0}>
          {busy ? 'Creating…' : 'Create group'}
        </Button>
      </div>
    </form>
  );
};

export const CreateGroupModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="Create group" size="sm">
    <CreateGroupForm onCreated={onClose} />
  </Modal>
);
