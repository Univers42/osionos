/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ConfirmModals.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';

import { Button, Modal } from '@/shared/ui';

export const ConfirmModal: React.FC<{ title: string; message: string; actionLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }> = ({ title, message, actionLabel, danger, onConfirm, onClose }) => (
  <Modal open onClose={onClose} title={title} size="sm">
    <div className="space-y-4">
      <p className="text-sm text-[var(--osio-fg-muted)]">{message}</p>
      <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone={danger ? 'danger' : 'primary'} onClick={onConfirm}>{actionLabel}</Button></div>
    </div>
  </Modal>
);

export const TypedConfirmModal: React.FC<{ title: string; message: string; confirmText: string; actionLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }> = ({ title, message, confirmText, actionLabel, danger, onConfirm, onClose }) => {
  const [draft, setDraft] = useState('');
  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-[var(--osio-fg-muted)]">{message}</p>
        <input className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={confirmText} />
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone={danger ? 'danger' : 'primary'} disabled={draft !== confirmText} onClick={onConfirm}>{actionLabel}</Button></div>
      </div>
    </Modal>
  );
};
