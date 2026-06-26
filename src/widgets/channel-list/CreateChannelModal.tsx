/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CreateChannelModal.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Create-channel chooser: name + type (text / voice / video) + public/private,
 * posting to the existing POST /api/chat/channels. Opens the new channel as a
 * tab on success (same mechanism as the channel list). Controlled like
 * CreateGroupModal (open / onClose), with onCreated to refresh the list.
 */

import React, { useState } from 'react';
import { Hash, Lock, Video, Volume2 } from 'lucide-react';

import { createChannel, type ChatChannel } from '@/shared/chat/channelApi';
import { Button, Input } from '@/shared/ui';
import { Modal } from '@/shared/ui/primitives/Modal';
import { useUserStore } from '@/features/auth';
import { genId } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';

type Kind = 'text' | 'voice' | 'video';

const KINDS: { value: Kind; label: string; Icon: typeof Hash }[] = [
  { value: 'text', label: 'Text', Icon: Hash },
  { value: 'voice', label: 'Voice', Icon: Volume2 },
  { value: 'video', label: 'Video', Icon: Video },
];

function openChannelTab(channel: ChatChannel) {
  useWorkspaceLayout.getState().openTab({
    tabId: genId('tab'),
    pageId: channel.id,
    workspaceId: channel.workspaceId,
    kind: 'channel',
    title: channel.name,
    icon: channel.kind === 'voice' || channel.kind === 'video' ? 'icon:video' : 'icon:hash',
  });
}

const CreateChannelForm: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? '');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('text');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    if (!workspaceId) { setError('No active workspace.'); return; }
    setBusy(true);
    setError(null);
    try {
      const channel = await createChannel({ workspaceId, name: name.trim(), kind, isPrivate });
      openChannelTab(channel);
      onCreated();
    } catch {
      setError('Could not create the channel.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 p-5">
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="channel-name" autoFocus required />
      <div className="grid gap-1.5">
        <span className="text-xs font-medium text-[var(--osio-fg-muted)]">Type</span>
        <div className="grid grid-cols-3 gap-1.5">
          {KINDS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs ${kind === value
                ? 'border-[var(--osio-accent)] bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]'
                : 'border-[var(--osio-border-default)] text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]'}`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between rounded-md border border-[var(--osio-border-default)] px-3 py-2 text-sm">
        <span className="flex items-center gap-2"><Lock size={14} /> Private channel</span>
        <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
      </label>
      <p className="text-xs text-[var(--osio-fg-subtle)]">
        {isPrivate ? 'Only invited members can find and join.' : 'Anyone in the workspace can find and join.'}
      </p>
      {error ? <p className="text-sm text-[var(--osio-danger)]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="submit" tone="primary" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create channel'}
        </Button>
      </div>
    </form>
  );
};

export const CreateChannelModal: React.FC<{ open: boolean; onClose: () => void; onCreated?: () => void }> = ({ open, onClose, onCreated }) => (
  <Modal open={open} onClose={onClose} title="Create channel" size="sm">
    <CreateChannelForm onCreated={() => { onCreated?.(); onClose(); }} />
  </Modal>
);
