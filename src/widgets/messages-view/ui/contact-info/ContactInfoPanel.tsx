/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ContactInfoPanel.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * WhatsApp-style "Contact info" right rail for the selected conversation:
 * avatar + name + about, then the "Media, links & docs" gallery. For a DM we
 * resolve the peer profile (useProfile, peerUserId from the channel) to reuse
 * the avatar/presence ProfileView pieces; group/community channels fall back to
 * the channel's own name + avatar.
 */

import React from 'react';
import { X } from 'lucide-react';

import type { ChatChannel } from '@/shared/chat/channelApi';
import { useProfile } from '@/widgets/profile-page/useProfile';
import { MediaGallery } from './MediaGallery';

interface ContactInfoPanelProps {
  channel: ChatChannel;
  peerUserId?: string | null;
  onClose: () => void;
}

const Avatar: React.FC<{ name: string; src?: string | null; online?: boolean }> = ({ name, src, online }) => (
  <div className="relative">
    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[var(--osio-accent)] text-2xl font-bold text-[var(--osio-accent-fg)]">
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : name.slice(0, 1).toUpperCase()}
    </div>
    {typeof online === 'boolean' ? (
      <span
        title={online ? 'Online' : 'Offline'}
        className={`absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-2 border-[var(--osio-bg-surface)] ${online ? 'bg-green-500' : 'bg-[var(--osio-fg-subtle)]'}`}
      />
    ) : null}
  </div>
);

export const ContactInfoPanel: React.FC<ContactInfoPanelProps> = ({ channel, peerUserId, onClose }) => {
  const { profile } = useProfile(peerUserId ?? '');
  const name = profile?.name ?? channel.name;
  const avatar = profile?.avatar ?? channel.avatar ?? null;
  const about = profile?.role ?? channel.description ?? channel.topic ?? null;
  const online = peerUserId ? profile?.online : undefined;

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)]">
      <header className="flex min-h-14 items-center justify-between border-b border-[var(--osio-border-default)] px-4">
        <h2 className="text-sm font-semibold">Contact info</h2>
        <button
          type="button"
          aria-label="Close contact info"
          onClick={onClose}
          className="rounded-md p-1.5 text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <Avatar name={name} src={avatar} online={online} />
        <h3 className="mt-1 truncate text-lg font-semibold text-[var(--osio-fg-default)]">{name}</h3>
        {about ? <p className="text-sm text-[var(--osio-fg-muted)]">{about}</p> : null}
      </div>

      <div className="border-t border-[var(--osio-border-default)] px-4 py-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--osio-fg-subtle)]">
          Media, links &amp; docs
        </p>
        <MediaGallery channelId={channel.id} />
      </div>
    </aside>
  );
};
