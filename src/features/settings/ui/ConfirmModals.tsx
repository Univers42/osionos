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

import React, { useId, useState } from 'react';

import { Button, Modal } from '@/shared/ui';
import { SUDO_REQUIRED_CODE } from '@/shared/api/sudoRequired';

import { canRetryAfterSudo, useSudoPromptStore } from './sudo/sudoPromptModel';

/**
 * How long a confirm waits before it closes, so an action that answers at once
 * does not make the dialog blink.
 *
 * Caveat: it is a floor, not a cap: a slow action waits for itself, and a
 * failed one says so straight away instead of sitting on the pending state.
 */
const MIN_PENDING_MS = 300;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => { globalThis.setTimeout(resolve, ms); });
}

/**
 * The body both confirm dialogs share: the message, the failure line and the
 * two buttons.
 *
 * `onConfirm` may return a promise: while it runs the dialog waits, both
 * buttons are disabled and the action says what it is doing. A rejection keeps
 * the dialog open and says what went wrong, so a destructive action never
 * reports a success it did not have.
 *
 * A rejection whose `code` is `sudo_required` is not a failure: the shared fetch path has already
 * raised the sudo prompt, so the dialog says nothing, stays open and its button reads "Try again",
 * enabled once the prompt has granted. Nothing re-sends by itself.
 */
const ConfirmBody: React.FC<{
  message: string;
  actionLabel: string;
  danger?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
  children?: React.ReactNode;
}> = ({ message, actionLabel, danger, confirmDisabled = false, onConfirm, onClose, children }) => {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const grants = useSudoPromptStore((state) => state.grants);
  const [needsSudo, setNeedsSudo] = useState(false);
  const [grantsAtRefusal, setGrantsAtRefusal] = useState(grants);
  const canRetry = canRetryAfterSudo(needsSudo, grants, grantsAtRefusal);

  async function handleConfirm() {
    const startedAt = Date.now();
    setPending(true);
    setFailure(null);
    setNeedsSudo(false);
    try {
      await onConfirm();
      const waited = Date.now() - startedAt;
      if (waited < MIN_PENDING_MS) await wait(MIN_PENDING_MS - waited);
      onClose();
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code === SUDO_REQUIRED_CODE) {
        setNeedsSudo(true);
        setGrantsAtRefusal(grants);
        setPending(false);
        return;
      }
      setFailure(error instanceof Error && error.message.trim() ? error.message : 'That action did not go through.');
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* The kit's Modal owns the accessible description: `description` is the
          paragraph the dialog's aria-describedby points at. The copy here is
          the one the person reads. */}
      <p className="text-sm text-[var(--osio-fg-muted)]">{message}</p>
      {children}
      {failure && <p role="alert" className="text-sm text-[var(--osio-danger)]">{failure}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose} disabled={pending}>Cancel</Button>
        <Button tone={danger ? 'danger' : 'primary'} onClick={handleConfirm} disabled={pending || confirmDisabled || !canRetry}>
          {pending ? `${actionLabel}…` : needsSudo ? 'Try again' : actionLabel}
        </Button>
      </div>
    </div>
  );
};

export const ConfirmModal: React.FC<{
  title: string;
  message: string;
  actionLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
}> = ({ title, message, actionLabel, danger, onConfirm, onClose }) => (
  <Modal open onClose={onClose} title={title} description={message} size="sm">
    <ConfirmBody message={message} actionLabel={actionLabel} danger={danger} onConfirm={onConfirm} onClose={onClose} />
  </Modal>
);

export const TypedConfirmModal: React.FC<{
  title: string;
  message: string;
  confirmText: string;
  actionLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
}> = ({ title, message, confirmText, actionLabel, danger, onConfirm, onClose }) => {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  return (
    <Modal open onClose={onClose} title={title} description={message} size="sm">
      <ConfirmBody
        message={message}
        actionLabel={actionLabel}
        danger={danger}
        confirmDisabled={draft !== confirmText}
        onConfirm={onConfirm}
        onClose={onClose}
      >
        <div className="space-y-1">
          <label htmlFor={inputId} className="block text-sm font-medium text-[var(--osio-fg-default)]">Type {confirmText} to confirm</label>
          <input
            id={inputId}
            className="w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={confirmText}
          />
        </div>
      </ConfirmBody>
    </Modal>
  );
};
