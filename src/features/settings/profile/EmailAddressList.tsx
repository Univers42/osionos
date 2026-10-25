/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmailAddressList.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useState } from 'react';

import { Button, Input } from '@/shared/ui';
import type { EmailRecord } from '@/store/settings/types';
import { makePrimaryQuestion, maskEmail } from './emailCopy';

export interface EmailAddressListProps {
  records: EmailRecord[];
  busy: boolean;
  confirmingId: string | null;
  primaryConfirmingId: string | null;
  onVerify: (id: string, code: string) => void;
  onResend: (id: string) => void;
  /** Cancel on a pending row removes it; on a verified row it asks first. */
  onRemove: (id: string, verified: boolean) => void;
  onConfirmRemove: (id: string) => void;
  onKeep: () => void;
  onMakePrimary: (id: string) => void;
  onConfirmPrimary: (id: string) => void;
  onKeepPrimary: () => void;
}

const CODE_SHAPE = /^\d{6}$/;

const PendingControls: React.FC<{ record: EmailRecord } & EmailAddressListProps> = ({ record, busy, onVerify, onResend, onRemove }) => {
  const [code, setCode] = useState('');
  const hintId = `email-code-hint-${record._id}`;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Input
          id={`email-code-${record._id}`}
          className="w-32"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-label={`Code for ${maskEmail(record.email)}`}
          aria-describedby={hintId}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        />
        <Button tone="primary" disabled={busy || !CODE_SHAPE.test(code)} onClick={() => onVerify(record._id, code)}>Verify</Button>
        <Button disabled={busy} onClick={() => onResend(record._id)}>Resend code</Button>
        <Button tone="ghost" disabled={busy} onClick={() => onRemove(record._id, false)}>Cancel</Button>
      </div>
      <p id={hintId} className="text-xs text-[var(--osio-fg-muted)]">
        The email is titled &apos;sign-in code&apos;. It is this code. No code? Wait a few minutes, then Resend.
      </p>
    </div>
  );
};

const RemoveConfirm: React.FC<{ record: EmailRecord } & EmailAddressListProps> = ({ record, busy, onConfirmRemove, onKeep }) => (
  <div role="group" aria-label="Confirm removal" className="flex flex-wrap items-center gap-2">
    <span className="text-sm">Remove {maskEmail(record.email)}? It can no longer be used for this account.</span>
    <Button onClick={onKeep}>Cancel</Button>
    <Button tone="danger" disabled={busy} onClick={() => onConfirmRemove(record._id)}>{busy ? 'Removing…' : 'Remove'}</Button>
  </div>
);

const PrimaryConfirm: React.FC<{ record: EmailRecord; current: string } & EmailAddressListProps> = ({ record, current, busy, onConfirmPrimary, onKeepPrimary }) => (
  <div role="group" aria-label="Confirm new primary address" className="flex flex-wrap items-center gap-2">
    <span className="text-sm">{makePrimaryQuestion(record.email, current)}</span>
    <Button className="min-h-11" onClick={onKeepPrimary}>Cancel</Button>
    <Button className="min-h-11" tone="primary" disabled={busy} onClick={() => onConfirmPrimary(record._id)}>{busy ? 'Changing…' : 'Make primary'}</Button>
  </div>
);

const RowStatus: React.FC<{ record: EmailRecord }> = ({ record }) => {
  if (record.isPrimary) return <span className="text-xs text-[var(--osio-fg-muted)]">Primary</span>;
  return <span className="text-xs text-[var(--osio-fg-muted)]">{record.verifiedAt ? 'Verified' : 'Not verified'}</span>;
};

export const EmailAddressList: React.FC<EmailAddressListProps> = (props) => {
  const current = props.records.find((record) => record.isPrimary)?.email ?? 'Your current address';
  return (
    <ul className="divide-y divide-[var(--osio-db-line-soft)] rounded-[var(--osio-radius-panel)] border border-[var(--osio-db-line)]">
      {props.records.map((record) => (
        <li key={record._id} className="space-y-2 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 break-all text-sm font-medium">{record.email}</span>
            <RowStatus record={record} />
            {!record.isPrimary && record.verifiedAt && props.confirmingId !== record._id && props.primaryConfirmingId !== record._id && (
              <>
                <Button className="min-h-11" tone="ghost" disabled={props.busy} aria-label={`Make primary, ${record.email}`} onClick={() => props.onMakePrimary(record._id)}>Make primary</Button>
                <Button className="min-h-11" tone="ghost" disabled={props.busy} onClick={() => props.onRemove(record._id, true)}>Remove</Button>
              </>
            )}
          </div>
          {!record.isPrimary && !record.verifiedAt && <PendingControls record={record} {...props} />}
          {props.confirmingId === record._id && <RemoveConfirm record={record} {...props} />}
          {props.primaryConfirmingId === record._id && <PrimaryConfirm record={record} current={current} {...props} />}
        </li>
      ))}
    </ul>
  );
};
