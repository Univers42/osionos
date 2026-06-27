/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   CollabCard.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** One joinable project: title, meta, and a CTA that depends on join state. */

import React, { useState } from 'react';

import { Badge, Button, Card } from '@/shared/ui';
import { Modal } from '@/shared/ui/primitives';
import type { CollabWorkspace } from '@/shared/social/collabApi';

const VISIBILITY_LABEL: Record<CollabWorkspace['visibility'], string> = {
  confidential: 'Confidential',
  request_to_join: 'Request to join',
  public: 'Public',
};

interface CollabCardProps {
  workspace: CollabWorkspace;
  onJoin: (id: string, message?: string) => void | Promise<void>;
}

function RequestModal({ name, onClose, onSubmit }: { name: string; onClose: () => void; onSubmit: (message: string) => void }) {
  const [message, setMessage] = useState('');
  return (
    <Modal open onClose={onClose} title={`Request access to ${name}`} size="sm">
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => { event.preventDefault(); onSubmit(message.trim()); }}
      >
        <p className="text-sm text-[var(--osio-fg-muted)]">Tell the owner why you want to join.</p>
        <textarea
          autoFocus
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Optional message…"
          rows={3}
          className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2.5 py-1.5 text-sm text-[var(--osio-fg-default)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        />
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={onClose}>Cancel</Button>
          <Button tone="primary" type="submit">Send request</Button>
        </div>
      </form>
    </Modal>
  );
}

function JoinCta({ workspace, onJoin }: CollabCardProps) {
  const [asking, setAsking] = useState(false);
  if (workspace.joinState === 'member') return <Badge tone="success">Joined</Badge>;
  if (workspace.joinState === 'requested') return <Badge tone="accent">Requested</Badge>;
  if (workspace.visibility === 'public') {
    return <Button tone="primary" onClick={() => void onJoin(workspace.id)}>Join</Button>;
  }
  // request_to_join (confidential cards are filtered out before render).
  return (
    <>
      <Button tone="default" onClick={() => setAsking(true)}>Request access</Button>
      {asking ? (
        <RequestModal
          name={workspace.name}
          onClose={() => setAsking(false)}
          onSubmit={(message) => { setAsking(false); void onJoin(workspace.id, message || undefined); }}
        />
      ) : null}
    </>
  );
}

export const CollabCard: React.FC<CollabCardProps> = ({ workspace, onJoin }) => (
  <Card>
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold text-[var(--osio-fg-strong)]">{workspace.name}</span>
        <Badge>{VISIBILITY_LABEL[workspace.visibility]}</Badge>
      </div>
      <p className="text-sm text-[var(--osio-fg-muted)]">
        {workspace.memberCount} {workspace.memberCount === 1 ? 'member' : 'members'}
        {workspace.owner ? ` · by ${workspace.owner.name}` : ''}
      </p>
      <div className="mt-auto flex items-center gap-2">
        <JoinCta workspace={workspace} onJoin={onJoin} />
      </div>
    </div>
  </Card>
);
