/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmailManagerModal.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useRef, useState } from 'react';

import type { AccountSecurityOutcome } from '@/shared/api/accountSecurityApi';
import { Modal } from '@/shared/ui';
import { useAccountEmailsStore } from '@/store/settings';
import { defaultEmail } from '@/store/settings/defaults';
import { useSudoPromptStore } from '../ui/sudo/sudoPromptModel';
import { EmailManagerBody } from './EmailManagerBody';
import { emailProblem, madePrimaryNotice } from './emailCopy';
import { runBusy } from './runBusy';

interface EmailManagerModalProps {
  userId: string;
  fallbackEmail?: string;
  onClose: () => void;
}

export const EmailManagerModal: React.FC<EmailManagerModalProps> = ({ userId, fallbackEmail, onClose }) => {
  const store = useAccountEmailsStore();
  const grants = useSudoPromptStore((state) => state.grants);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [primaryConfirmingId, setPrimaryConfirmingId] = useState<string | null>(null);
  const [needsSudo, setNeedsSudo] = useState(false);
  const [grantsAtRefusal, setGrantsAtRefusal] = useState(grants);
  const retry = useRef<(() => Promise<boolean>) | null>(null);
  const records = store.data.length || !fallbackEmail ? store.data : [defaultEmail(userId, fallbackEmail)];

  // A refused sudo keeps the action to run again once the prompt grants; nothing re-sends by itself.
  async function attempt<T>(act: () => Promise<AccountSecurityOutcome<T>>, onOk: (data: T) => void, action: 'add' | 'primary' = 'add'): Promise<boolean> {
    setProblem('');
    setNotice('');
    const outcome = await runBusy(setBusy, act);
    if (outcome.ok) {
      setNeedsSudo(false);
      onOk(outcome.data);
      return true;
    }
    if (outcome.reason === 'sudo_required') {
      setNeedsSudo(true);
      setGrantsAtRefusal(grants);
      retry.current = () => attempt(act, onOk, action);
      return false;
    }
    setNeedsSudo(false);
    setProblem(emailProblem(outcome, action));
    // The address changed although the sign-outs failed: the question is answered.
    if (outcome.reason === 'failed' && outcome.code === 'email_changed_signout_failed') setPrimaryConfirmingId(null);
    return false;
  }

  const codeSent = (id: string | null, sentTo: string) => {
    setNotice(`Code sent to ${sentTo}`);
    if (id) requestAnimationFrame(() => document.getElementById(`email-code-${id}`)?.focus());
  };

  return (
    <Modal open onClose={onClose} title="Manage emails" size="md">
      <EmailManagerBody
        records={records}
        loading={store.loading}
        loadError={store.error}
        busy={busy}
        onClose={onClose}
        confirmingId={confirmingId}
        primaryConfirmingId={primaryConfirmingId}
        problem={problem}
        notice={notice}
        needsSudo={needsSudo}
        canRetry={grants > grantsAtRefusal}
        onTryAgain={() => { void retry.current?.(); }}
        onReload={() => { void store.hydrate(userId, fallbackEmail); }}
        onAdd={(email) => attempt(() => store.add(email), (sent) => codeSent(sent.id, sent.sentTo))}
        onResend={(id) => { void attempt(() => store.resend(id), (sent) => codeSent(id, sent.sentTo)); }}
        onVerify={(id, code) => { void attempt(() => store.verify(id, code), () => setNotice('Email verified')); }}
        onRemove={(id, verified) => {
          if (verified) { setPrimaryConfirmingId(null); setConfirmingId(id); }
          else void attempt(() => store.remove(id), () => undefined);
        }}
        onConfirmRemove={(id) => { void attempt(() => store.remove(id), () => setConfirmingId(null)); }}
        onKeep={() => setConfirmingId(null)}
        onMakePrimary={(id) => { setConfirmingId(null); setPrimaryConfirmingId(id); }}
        onKeepPrimary={() => setPrimaryConfirmingId(null)}
        onConfirmPrimary={(id) => {
          const address = records.find((record) => record._id === id)?.email ?? 'The address';
          void attempt(() => store.makePrimary(id), (made) => { setPrimaryConfirmingId(null); setNotice(madePrimaryNotice(address, made.previous !== null)); }, 'primary');
        }}
      />
    </Modal>
  );
};
