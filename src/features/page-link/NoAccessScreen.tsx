/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NoAccessScreen.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from 'react';

import { usePageStore } from '@/store/usePageStore';
import { trySettingsPost, errorCode } from '@/store/settings/settingsStoreUtils';
import { getActiveWorkspaceId } from '@/shared/api/client';

const NOTE_MAX = 280;
const sentIds = new Set<string>();

/** Test hook: clear the per-session "already requested" set. */
export function resetPageAccessRequests(): void {
  sentIds.clear();
}

export const NoAccessScreen: React.FC = () => {
  const deniedPage = usePageStore((s) => s.deniedPage);
  if (!deniedPage) return null;
  return <NoAccessScreenBody key={deniedPage.pageId} page={deniedPage} />;
};

interface Page { pageId: string; workspaceId: string | null }

interface BodyProps { page: Page }

const NoAccessScreenBody: React.FC<BodyProps> = ({ page }) => {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'rate' | 'unavailable' | 'error'>(
    sentIds.has(page.pageId) ? 'sent' : 'idle',
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const disabled = status === 'sending' || status === 'sent' || status === 'unavailable';

  async function requestAccess() {
    if (disabled) return;
    const workspaceId = page.workspaceId ?? getActiveWorkspaceId();
    setStatus('sending');
    try {
      const res = await trySettingsPost<{ ok?: boolean }>(
        `/api/pages/${encodeURIComponent(page.pageId)}/access-requests`,
        { workspaceId, note: note.trim() ? note.trim().slice(0, NOTE_MAX) : undefined },
      );
      if (res === null) {
        setStatus('unavailable');
      } else {
        sentIds.add(page.pageId);
        setStatus('sent');
      }
    } catch (error) {
      const code = errorCode(error);
      const statusNumber = (error as { status?: number } | null)?.status;
      if (code === 'rate_limited' || statusNumber === 429) {
        setStatus('rate');
      } else {
        setStatus('error');
      }
    }
  }

  return (
    <section
      role="region"
      aria-label="No access"
      className="flex h-full w-full items-center justify-center bg-[var(--osio-bg-page)] p-6"
    >
      <div className="w-full max-w-md space-y-4 text-center">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold text-[var(--osio-fg-default)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
        >
          You don&apos;t have access to this page
        </h1>
        <p className="text-sm text-[var(--osio-fg-muted)]">Ask the page owner for access.</p>

        <div className="space-y-2 text-left">
          <label htmlFor="access-request-note" className="block text-xs font-medium text-[var(--osio-fg-muted)]">
            Note (optional)
          </label>
          <textarea
            id="access-request-note"
            maxLength={NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX))}
            className="min-h-[88px] w-full resize-y rounded-[var(--osio-radius-sm)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-panel)] p-2 text-sm text-[var(--osio-fg-default)]"
          />
          <span className="block text-right text-xs text-[var(--osio-fg-subtle)]">
            {note.length}/{NOTE_MAX}
          </span>
        </div>

        {status !== 'unavailable' && (
          <button
            type="button"
            disabled={disabled}
            aria-busy={status === 'sending'}
            onClick={() => { void requestAccess(); }}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--osio-radius-sm)] bg-[var(--osio-accent)] px-4 text-sm font-medium text-[var(--osio-accent-fg)] disabled:opacity-50"
          >
            {status === 'sending' ? 'Sending\u2026' : 'Request access'}
          </button>
        )}

        {status === 'sent' && (
          <p className="text-sm text-[var(--osio-fg-muted)]">
            Request sent. You&apos;ll get a notification if the owner approves.
          </p>
        )}
        {status === 'rate' && (
          <p className="text-sm text-[var(--osio-danger)]">Too many requests. Try again later.</p>
        )}
        {status === 'error' && (
          <p role="alert" className="text-sm text-[var(--osio-danger)]">Couldn&apos;t send the request. Try again.</p>
        )}
      </div>
    </section>
  );
};