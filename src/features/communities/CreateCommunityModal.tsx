/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CreateCommunityModal.tsx                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Create-community dialog: name + description + optional avatar (shared
 * IconPicker), then createCommunity. A community is a labeled grouping of
 * channels (WhatsApp community / Discord server-lite); members add channels and
 * open them from CommunityPanel afterward. On success calls onCreated(community)
 * so the caller can refresh its list / open the new panel.
 */

import React, { useState } from 'react';

import type { Community } from '@/shared/social/communityApi';
import { Button, IconPicker, IconValueView, Input } from '@/shared/ui';
import { Modal } from '@/shared/ui/primitives/Modal';
import { useCreateCommunity } from './useCommunity';

const AvatarTrigger: React.FC<{ avatar?: string; onChange: (value?: string) => void }> = ({
  avatar,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Choose community avatar"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] text-lg hover:bg-[var(--osio-bg-hover)]"
      >
        {avatar ? <IconValueView value={avatar} size={20} /> : '🏘️'}
      </button>
      {open && (
        <IconPicker
          current={avatar}
          onSelect={(value) => onChange(value)}
          onRemove={() => onChange(undefined)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

const CreateCommunityForm: React.FC<{ onCreated: (community: Community) => void }> = ({
  onCreated,
}) => {
  const { busy, error, create } = useCreateCommunity();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const community = await create({
      name: name.trim(),
      description: description.trim() || undefined,
      avatar,
    });
    if (community) onCreated(community);
  };

  return (
    <form onSubmit={submit} className="grid gap-4 p-5">
      <div className="flex items-center gap-3">
        <AvatarTrigger avatar={avatar} onChange={setAvatar} />
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Community name"
          autoFocus
          required
          className="flex-1"
        />
      </div>
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--osio-fg-muted)]">Description (optional)</span>
        <Input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What this community is about"
        />
      </div>
      {error ? <p className="text-sm text-[var(--osio-danger)]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="submit" tone="primary" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create community'}
        </Button>
      </div>
    </form>
  );
};

export const CreateCommunityModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreated?: (community: Community) => void;
}> = ({ open, onClose, onCreated }) => (
  <Modal open={open} onClose={onClose} title="Create community" size="sm">
    <CreateCommunityForm
      onCreated={(community) => {
        onCreated?.(community);
        onClose();
      }}
    />
  </Modal>
);
