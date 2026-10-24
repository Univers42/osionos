/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TwoFactorModal.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';

import { Button, Modal, useToastStore } from '@/shared/ui';
import type { PreferredMfaMethod } from '@/store/settings/types';
import { accountActionNotice, runAsync, type AccountActionOutcome } from '../model/settingsCalls';
import { RECORD_UNAVAILABLE, SIGNED_OUT_NOTICE, adoptSessionToken, confirmEnrolment, createRecoveryCodes, disableTwoStep, dropSessionAfterStepUp, startEnrolment, type TwoStepState } from './twoStepClient';
import { METHOD_LABELS, orderedMethods } from './twoStepMethods';

const FIELD = 'w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 py-2 text-sm outline-none transition-colors duration-(--osio-dur-fast) focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]';
const SUDO_HINT = "Confirm it's you first, then press the button again.";

interface Props {
  userId: string;
  state: TwoStepState;
  preferred: PreferredMfaMethod | undefined;
  onPreferred: (method: PreferredMfaMethod) => void;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

type Step = { name: 'idle' } | { name: 'scan'; qr: string } | { name: 'codes'; codes: string[] };

export const TwoFactorModal: React.FC<Props> = ({ userId, state, preferred, onPreferred, onChanged, onClose }) => {
  const toast = useToastStore((store) => store.push);
  const [step, setStep] = useState<Step>({ name: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  /** Runs one action; returns its data, or null after saying why it did not happen. */
  async function attempt<T>(run: () => Promise<AccountActionOutcome<T>>, label: string, endsSession = false): Promise<T | null> {
    setBusy(true);
    setProblem('');
    const outcome = await run();
    setBusy(false);
    if (outcome.ok) return outcome.data;
    if (endsSession && outcome.code === RECORD_UNAVAILABLE) {
      // The factor changed and the server cut every session off but could not start a new one.
      setProblem(SIGNED_OUT_NOTICE);
      dropSessionAfterStepUp(userId);
      return null;
    }
    if (outcome.reason === 'sudo_required') setProblem(SUDO_HINT);
    else setProblem(accountActionNotice(outcome, label)?.description ?? `${label} isn't available on this server yet.`);
    return null;
  }

  async function begin() {
    const data = await attempt(startEnrolment, 'Setting up two-step verification');
    if (!data?.otpauthUrl) { if (data) setProblem('The server sent no setup key.'); return; }
    const { default: QRCode } = await import('qrcode');
    setStep({ name: 'scan', qr: await QRCode.toDataURL(data.otpauthUrl) });
  }

  async function confirm() {
    const done = await attempt(() => confirmEnrolment(code), 'Verifying the code', true);
    if (!done) return;
    // The server retired the old token when it confirmed; the next call must carry the new one.
    adoptSessionToken(userId, done.accessToken, done.refreshToken);
    const made = await attempt(createRecoveryCodes, 'Creating recovery codes');
    setCode('');
    await onChanged();
    if (made?.codes?.length) setStep({ name: 'codes', codes: made.codes });
    else { setStep({ name: 'idle' }); toast({ kind: 'info', title: 'Two-step verification is on', description: 'Recovery codes were not created; create them from this window.' }); }
  }

  async function makeCodes() {
    const made = await attempt(createRecoveryCodes, 'Creating recovery codes');
    await onChanged();
    if (made?.codes?.length) setStep({ name: 'codes', codes: made.codes });
  }

  async function disable() {
    const done = await attempt(disableTwoStep, 'Turning off two-step verification', true);
    if (!done) return;
    adoptSessionToken(userId, done.accessToken, done.refreshToken);
    await onChanged();
    toast({ kind: 'success', title: 'Two-step verification turned off' });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Two-step verification" size="sm">
      <div className="space-y-4">
        {state.phase === 'loading' && <p className="text-sm text-[var(--osio-fg-muted)]">Checking your two-step verification…</p>}
        {state.phase === 'unavailable' && <p className="text-sm text-[var(--osio-fg-muted)]">Two-step verification isn&apos;t available on this server yet.</p>}
        {step.name === 'codes' && (
          <>
            <p className="text-sm text-[var(--osio-fg-muted)]">Save these recovery codes now. Each works once, and they are not shown again.</p>
            <ul aria-label="Recovery codes" className="grid grid-cols-2 gap-2 rounded-md bg-[var(--osio-bg-subtle)] p-3 font-mono text-xs">{step.codes.map((item) => <li key={item}>{item}</li>)}</ul>
            <div className="flex justify-end"><Button tone="primary" onClick={onClose}>I saved these codes</Button></div>
          </>
        )}
        {step.name === 'scan' && (
          <>
            <img alt="Two-step verification QR code" className="h-40 w-40 rounded-md border border-[var(--osio-border-default)]" src={step.qr} />
            <input className={FIELD} aria-label="6-digit code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replaceAll(/\D/g, '').slice(0, 6))} placeholder="6-digit code" />
            <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button tone="primary" disabled={busy || code.length !== 6} onClick={() => runAsync(confirm())}>Verify</Button></div>
          </>
        )}
        {step.name === 'idle' && state.phase === 'ready' && !state.status.enabled && (
          <>
            <p className="text-sm text-[var(--osio-fg-muted)]">Two-step verification is off. Use an authenticator app to add a second step at sign-in.</p>
            <div className="flex justify-end"><Button tone="primary" disabled={busy} onClick={() => runAsync(begin())}>Set up authenticator app</Button></div>
          </>
        )}
        {step.name === 'idle' && state.phase === 'ready' && state.status.enabled && (
          <>
            <p className="text-sm text-[var(--osio-fg-muted)]">Two-step verification is on. {state.status.recoveryRemaining} recovery code{state.status.recoveryRemaining === 1 ? '' : 's'} left.</p>
            <ol aria-label="Verification methods" className="space-y-2">
              {orderedMethods(preferred).map((method, index) => (
                <li key={method} className="flex items-center justify-between gap-2 text-sm">
                  <span>{METHOD_LABELS[method]}{index === 0 && ' (preferred)'}</span>
                  {index > 0 && <Button onClick={() => onPreferred(method)}>Make preferred</Button>}
                </li>
              ))}
            </ol>
            <div className="flex justify-end gap-2">
              {state.status.recoveryRemaining === 0 && <Button disabled={busy} onClick={() => runAsync(makeCodes())}>Create recovery codes</Button>}
              <Button tone="danger-subtle" disabled={busy} onClick={() => runAsync(disable())}>Turn off</Button>
            </div>
          </>
        )}
        {problem && <p role="alert" className="text-sm text-[var(--osio-danger)]">{problem}</p>}
      </div>
    </Modal>
  );
};
