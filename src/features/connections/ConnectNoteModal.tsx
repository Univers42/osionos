/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConnectNoteModal.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Compose-an-intro-note modal for sending a connection request. Thin wrapper
 * over the generic NoteComposeModal — submits the note through useConnections'
 * sendRequest. Chat is never gated by this; it only governs the social graph.
 */

import React from 'react';

import { useConnections } from '@/features/connections/useConnections';
import { NoteComposeModal } from '@/shared/ui/NoteComposeModal';

interface ConnectNoteModalProps {
  userId: string;
  name?: string;
  open: boolean;
  onClose: () => void;
}

export const ConnectNoteModal: React.FC<ConnectNoteModalProps> = ({ userId, name, open, onClose }) => {
  const { sendRequest } = useConnections(userId);

  return (
    <NoteComposeModal
      open={open}
      onClose={onClose}
      onSubmit={(note) => sendRequest(userId, note || undefined)}
      title={name ? `Connect with ${name}` : 'Send connection request'}
      description="Add a short note so they know who you are. They can accept or decline."
      placeholder="Hi! I'd like to connect…"
      submitLabel="Send request"
    />
  );
};
