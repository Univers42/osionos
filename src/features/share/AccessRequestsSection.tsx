/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   AccessRequestsSection.tsx                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useState } from 'react';

import { trySettingsGet, trySettingsPost, errorCode } from '@/store/settings/settingsStoreUtils';
import { ApiError } from '@/shared/api/client';
import { formatRelativeTime as relativeTime } from '@/shared/lib/relativeTime';
import { useToastStore } from '@osionos/ui/primitives';

interface AccessRequest {
  id: string;
  pageId: string;
  pageTitle: string;
  requesterName: string;
  note: string | null;
  createdAt: string;
  existingPermission: 'can_view' | 'can_comment' | 'can_edit' | 'full_access' | null;
}

type RowStatus =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'existing_rule'; permission: string }
  | { kind: 'overridden' }
  | { kind: 'error'; message: string };

interface Props {
  workspaceId: string;
  pageId: string;
  onApproved: () => void;
}

const PERMISSIONS: Array<{ value: 'can_view' | 'can_comment' | 'can_edit'; label: string }> = [
  { value: 'can_view', label: 'Can view' },
  { value: 'can_comment', label: 'Can comment' },
  { value: 'can_edit', label: 'Can edit' },
];

function permissionLabel(value: string): string {
  if (value === 'can_comment') return 'Can comment';
  if (value === 'can_edit') return 'Can edit';
  return 'Can view';
}

export const AccessRequestsSection: React.FC<Props> = ({ workspaceId, pageId, onApproved }) => {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [perms, setPerms] = useState<Record<string, 'can_view' | 'can_comment' | 'can_edit'>>({});
  const [statuses, setStatuses] = useState<Record<string, RowStatus>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await trySettingsGet<{ requests?: AccessRequest[] }>(
        `/api/access-requests?workspaceId=${encodeURIComponent(workspaceId)}`,
      );
      if (body === null) {
        // Old bridge: no group.
        setRequests([]);
        return;
      }
      const filtered = (body.requests ?? []).filter((request) => request.pageId === pageId);
      setRequests(filtered);
      const nextPerms: Record<string, 'can_view' | 'can_comment' | 'can_edit'> = {};
      for (const request of filtered) {
        nextPerms[request.id] =
          request.existingPermission === 'can_comment' || request.existingPermission === 'can_edit'
            ? request.existingPermission
            : 'can_view';
      }
      setPerms(nextPerms);
      setStatuses({});
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        setRequests([]);
        return;
      }
      setError("Couldn't load access requests.");
    } finally {
      setLoading(false);
    }
  }, [pageId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = useCallback(async (request: AccessRequest, replace = false) => {
    setStatuses((current) => ({ ...current, [request.id]: { kind: 'working' } }));
    const permission = perms[request.id] ?? 'can_view';
    try {
      await trySettingsPost(`/api/access-requests/${encodeURIComponent(request.id)}/approve`, {
        permission,
        replace,
      });
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setStatuses((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      onApproved();
    } catch (cause) {
      const code = errorCode(cause);
      const details = (cause as { details?: { permission?: string } } | null)?.details;
      if (code === 'existing_rule') {
        setStatuses((current) => ({
          ...current,
          [request.id]: { kind: 'existing_rule', permission: details?.permission ?? permission },
        }));
      } else if (code === 'overridden_by_deny') {
        setStatuses((current) => ({ ...current, [request.id]: { kind: 'overridden' } }));
      } else if (code === 'request_closed') {
        setRequests((current) => current.filter((item) => item.id !== request.id));
        useToastStore.getState().push({ kind: 'info', title: 'This request was already handled.' });
      } else {
        setStatuses((current) => ({ ...current, [request.id]: { kind: 'error', message: 'Couldn\u2019t approve. Try again.' } }));
      }
    }
  }, [onApproved, perms]);

  const decline = useCallback(async (request: AccessRequest) => {
    setStatuses((current) => ({ ...current, [request.id]: { kind: 'working' } }));
    try {
      await trySettingsPost(`/api/access-requests/${encodeURIComponent(request.id)}/decline`, {});
      setRequests((current) => current.filter((item) => item.id !== request.id));
    } catch (cause) {
      const code = errorCode(cause);
      if (code === 'request_closed') {
        setRequests((current) => current.filter((item) => item.id !== request.id));
        useToastStore.getState().push({ kind: 'info', title: 'This request was already handled.' });
      } else {
        setStatuses((current) => ({ ...current, [request.id]: { kind: 'error', message: 'Couldn\u2019t decline. Try again.' } }));
      }
    }
  }, []);

  if (loading) {
    return (
      <div className="mt-3 space-y-2 border-t border-[var(--osio-border-default)] pt-2">
        <p className="osio-menu-label">Access requests</p>
        <div className="h-10 animate-pulse rounded-[var(--osio-radius-sm)] bg-[var(--osio-bg-hover)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 space-y-2 border-t border-[var(--osio-border-default)] pt-2">
        <p className="osio-menu-label">Access requests</p>
        <p className="text-xs text-[var(--osio-danger)]">{error}</p>
        <button type="button" className="min-h-11 text-xs underline" onClick={() => { void load(); }}>Retry</button>
      </div>
    );
  }

  if (requests.length === 0) return null;

  return (
    <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto border-t border-[var(--osio-border-default)] pt-2">
      <p className="osio-menu-label">Access requests</p>
      {requests.map((request) => {
        const status = statuses[request.id] ?? { kind: 'idle' };
        const working = status.kind === 'working';
        return (
          <div key={request.id} className="space-y-1 rounded-[var(--osio-radius-sm)] border border-[var(--osio-border-default)] p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 break-words text-sm font-medium text-[var(--osio-fg-default)]" style={{ overflowWrap: 'anywhere' }}>{request.requesterName}</span>
              <span className="shrink-0 text-xs text-[var(--osio-fg-subtle)]">{relativeTime(request.createdAt)}</span>
            </div>
            {request.note ? (
              <p className="break-words text-xs text-[var(--osio-fg-muted)]" style={{ overflowWrap: 'anywhere' }}>
                {request.note}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Permission for ${request.requesterName}`}
                value={perms[request.id] ?? 'can_view'}
                onChange={(event) =>
                  setPerms((current) => ({ ...current, [request.id]: event.target.value as 'can_view' | 'can_comment' | 'can_edit' }))
                }
                disabled={working}
                className="min-h-11 rounded-[var(--osio-radius-sm)] border border-[var(--osio-border-default)] bg-[var(--osio-bg-panel)] px-2 text-xs text-[var(--osio-fg-default)]"
              >
                {PERMISSIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={working}
                onClick={() => { void approve(request); }}
                className="min-h-11 rounded-[var(--osio-radius-sm)] bg-[var(--osio-accent)] px-3 text-xs font-medium text-[var(--osio-accent-fg)] disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => { void decline(request); }}
                className="min-h-11 rounded-[var(--osio-radius-sm)] border border-[var(--osio-border-default)] px-3 text-xs text-[var(--osio-fg-default)] disabled:opacity-50"
              >
                Decline
              </button>
            </div>

            {status.kind === 'existing_rule' && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--osio-fg-muted)]">
                <span>{request.requesterName} already has {permissionLabel(status.permission)}. Replace it?</span>
                <button
                  type="button"
                  className="min-h-11 rounded-[var(--osio-radius-sm)] bg-[var(--osio-accent)] px-3 text-xs font-medium text-[var(--osio-accent-fg)]"
                  onClick={() => { void approve(request, true); }}
                >
                  Replace
                </button>
              </div>
            )}
            {status.kind === 'overridden' && (
              <p className="text-xs text-[var(--osio-fg-muted)]">
                Access was granted, but a restriction on a parent page still blocks {request.requesterName}.
              </p>
            )}
            {status.kind === 'error' && (
              <p role="alert" className="text-xs text-[var(--osio-danger)]">{status.message}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};