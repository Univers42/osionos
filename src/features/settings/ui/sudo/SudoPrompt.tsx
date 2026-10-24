/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SudoPrompt.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useId, useState } from 'react';

import { requestSudoCode, verifySudoCode, type AccountSecurityOutcome } from '@/shared/api/accountSecurityApi';
import { Button, Modal } from '@/shared/ui';
import { startSudoListener, sudoSentence, useSudoPromptStore } from './sudoPromptModel';

function sentenceOf(outcome: AccountSecurityOutcome<unknown>): string {
  if (outcome.ok) return '';
  if (outcome.reason === 'rate_limited') return sudoSentence(outcome);
  if (outcome.reason === 'refused' || outcome.reason === 'failed') return sudoSentence({ code: outcome.code });
  return sudoSentence({ code: 'sudo_unavailable' });
}

const CODE_INPUT = 'w-40 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-center text-lg tracking-widest outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]';

const PromptBody: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const granted = useSudoPromptStore((state) => state.granted);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const inputId = useId();

  async function sendCode() {
    setBusy(true);
    setProblem('');
    const outcome = await requestSudoCode();
    setBusy(false);
    if (outcome.ok) setSentTo(outcome.data.sentTo);
    else setProblem(sentenceOf(outcome));
  }

  async function confirmCode() {
    setBusy(true);
    setProblem('');
    const outcome = await verifySudoCode(code);
    setBusy(false);
    if (outcome.ok) granted();
    else setProblem(sentenceOf(outcome));
  }

  return (
    <div className="space-y-4">
      {sentTo === null ? (
        <>
          <p className="text-sm text-[var(--osio-fg-muted)]">For your safety, we email you a six-digit code before this change.</p>
          <Button tone="primary" disabled={busy} onClick={() => { void sendCode(); }}>Email me a code</Button>
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-[var(--osio-fg-muted)]">We sent a code to {sentTo || 'your email address'}.</p>
          <label htmlFor={inputId} className="block text-sm font-medium text-[var(--osio-fg-default)]">Six-digit code</label>
          <input
            id={inputId}
            className={CODE_INPUT}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            aria-invalid={problem ? true : undefined}
            onChange={(event) => setCode(event.target.value.replaceAll(/\D/g, '').slice(0, 6))}
          />
        </div>
      )}
      {problem && <p role="alert" className="text-sm text-[var(--osio-danger)]">{problem}</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        {sentTo !== null && <Button tone="primary" disabled={busy || code.length !== 6} onClick={() => { void confirmCode(); }}>Confirm</Button>}
      </div>
    </div>
  );
};

/**
 * The one "Confirm it's you" prompt of the app. Mounted once in SettingsView; later
 * packages (password, 2FA, sessions) reuse it through the shared `sudo_required` event
 * instead of carrying a prompt of their own.
 */
export const SudoPrompt: React.FC = () => {
  const open = useSudoPromptStore((state) => state.open);
  const dismiss = useSudoPromptStore((state) => state.dismiss);
  useEffect(() => startSudoListener(), []);
  if (!open) return null;
  return (
    <Modal open onClose={dismiss} title="Confirm it's you" description="Confirm it's you with an emailed code." size="sm">
      <PromptBody onClose={dismiss} />
    </Modal>
  );
};
