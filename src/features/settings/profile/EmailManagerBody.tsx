/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   EmailManagerBody.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';

import { Button } from '@/shared/ui';
import { EmailAddForm } from './EmailAddForm';
import { EmailAddressList, type EmailAddressListProps } from './EmailAddressList';
import { SUDO_FIRST } from './emailCopy';

export interface EmailManagerBodyProps extends EmailAddressListProps {
  loading: boolean;
  /** The refresh failed; the rows already fetched stay on screen. */
  loadError: string | null;
  problem: string;
  /** Polite announcement, e.g. "Code sent to d•••@g•••.com". */
  notice: string;
  needsSudo: boolean;
  canRetry: boolean;
  onTryAgain: () => void;
  onReload: () => void;
  onAdd: (email: string) => Promise<boolean>;
}

const Skeleton: React.FC = () => (
  <div aria-busy="true" aria-label="Loading emails" className="space-y-2">
    {[0, 1].map((index) => <div key={index} className="h-10 animate-pulse rounded-md bg-[var(--osio-bg-muted)]" />)}
  </div>
);

export const EmailManagerBody: React.FC<EmailManagerBodyProps> = (props) => {
  const { records, loading, loadError, problem, notice, needsSudo, canRetry, busy } = props;
  const showSkeleton = loading && records.length === 0;
  return (
    <div className="space-y-4">
      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-2 text-sm text-[var(--osio-danger)]">
          <span>{loadError}</span>
          <Button onClick={props.onReload}>Retry</Button>
        </div>
      )}
      {showSkeleton ? <Skeleton /> : <EmailAddressList {...props} />}
      {!showSkeleton && records.every((record) => record.isPrimary) && <p className="text-sm text-[var(--osio-fg-muted)]">No other addresses</p>}
      <EmailAddForm busy={busy || showSkeleton} onAdd={props.onAdd} />
      <p aria-live="polite" className="min-h-4 text-xs text-[var(--osio-fg-muted)]">{notice}</p>
      {problem && <p role="alert" className="text-sm text-[var(--osio-danger)]">{problem}</p>}
      {needsSudo && (
        <div className="flex items-center gap-2">
          <span className="text-sm">{SUDO_FIRST}</span>
          <Button tone="primary" disabled={busy || !canRetry} onClick={props.onTryAgain}>Try again</Button>
        </div>
      )}
      <p className="text-xs text-[var(--osio-fg-muted)]">
        Extra addresses are kept on your account. You can&apos;t sign in with them yet. An address such as name+tag@ counts as a different address.
      </p>
    </div>
  );
};
