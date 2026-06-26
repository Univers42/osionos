/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ContactContextMenu.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Contact actions menu (Message / Connect / Block / Report) anchored to a
 * trigger via Popover. Message always opens a DM (chat is open to anyone).
 * Used by ProfileView and the people-search rows.
 */

import React, { useState } from 'react';
import { Flag, MessageCircle, ShieldOff, UserPlus } from 'lucide-react';

import { ConnectNoteModal } from '@/features/connections/ConnectNoteModal';
import { useConnections } from '@/features/connections/useConnections';
import { openDm } from '@/shared/chat/channelApi';
import { Menu, MenuItem } from '@/shared/ui/primitives/Menu';
import { Popover } from '@/shared/ui/primitives/Popover';
import { NoteComposeModal } from '@/shared/ui/NoteComposeModal';
import { genId } from '@/widgets/workspace-grid/model/layoutTree';
import { useWorkspaceLayout } from '@/widgets/workspace-grid/model/workspaceLayout';
import { useReportsStore } from '@/store/social/useReportsStore';

interface ContactContextMenuProps {
  userId: string;
  name?: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: 'start' | 'end';
}

function startDm(userId: string, onClose: () => void) {
  openDm(userId)
    .then((channel) => {
      useWorkspaceLayout.getState().openTab({
        tabId: genId('tab'),
        pageId: channel.id,
        workspaceId: channel.workspaceId,
        kind: 'channel',
        title: channel.name,
        icon: 'icon:message-circle',
      });
      onClose();
    })
    .catch(() => undefined);
}

export const ContactContextMenu: React.FC<ContactContextMenuProps> = ({
  userId,
  name,
  anchorRef,
  open,
  onClose,
  align = 'end',
}) => {
  const { state, isBlocked, block, unblock } = useConnections(userId);
  const submitReport = useReportsStore((store) => store.submit);
  const [connecting, setConnecting] = useState(false);
  const [reporting, setReporting] = useState(false);

  return (
    <>
      <Popover anchorRef={anchorRef} open={open} onClose={onClose} align={align}>
        <Menu>
          <MenuItem icon={<MessageCircle size={16} />} onClick={() => startDm(userId, onClose)}>
            Message
          </MenuItem>
          {state === 'none' ? (
            <MenuItem icon={<UserPlus size={16} />} onClick={() => { setConnecting(true); onClose(); }}>
              Connect
            </MenuItem>
          ) : null}
          <MenuItem
            icon={<ShieldOff size={16} />}
            destructive={!isBlocked}
            onClick={() => { void (isBlocked ? unblock(userId) : block(userId)); onClose(); }}
          >
            {isBlocked ? 'Unblock' : 'Block'}
          </MenuItem>
          <MenuItem icon={<Flag size={16} />} destructive onClick={() => { setReporting(true); onClose(); }}>
            Report
          </MenuItem>
        </Menu>
      </Popover>

      <ConnectNoteModal userId={userId} name={name} open={connecting} onClose={() => setConnecting(false)} />

      <NoteComposeModal
        open={reporting}
        onClose={() => setReporting(false)}
        onSubmit={(details) =>
          submitReport({ subjectUserId: userId, subjectKind: 'user', category: 'abuse', details: details || undefined })
        }
        title={name ? `Report ${name}` : 'Report user'}
        description="Tell us what's wrong. Our team reviews every report."
        placeholder="Describe the issue…"
        submitLabel="Submit report"
      />
    </>
  );
};

export type { ContactContextMenuProps };
