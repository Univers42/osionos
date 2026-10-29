import React from 'react';

import { Button } from '@/shared/ui';
import { inviteExpiryText } from '@/features/settings/people/inviteInboxModel';
import type { MineInvite } from '@/store/settings/types';

// 44 px touch target; the shared Button tones carry the border and focus ring in both themes.
const INVITE_ACTION_CLASS = 'min-h-11 flex-1';

interface Props {
  mine: readonly MineInvite[];
  mineLoading: boolean;
  mineError: string | null;
  busyInviteId: string | null;
  onRetry: () => void;
  onJoin: (invite: MineInvite) => void;
  onDecline: (invite: MineInvite) => void;
}

/** The pending-invites group of the workspace menu: one card per invite, with
 *  the same join/decline actions in loading, error and ready states. */
export const PendingInvitesSection: React.FC<Props> = ({ mine, mineLoading, mineError, busyInviteId, onRetry, onJoin, onDecline }) => (
  <div role="group" aria-label="Pending invites" aria-busy={mineLoading && mine.length === 0}>
    <div className="osio-menu-label flex items-center justify-between">
      <span className="truncate">Pending invites</span>
      {mine.length > 0 && (
        <span className="shrink-0 text-2xs text-[var(--osio-fg-muted)]">{mine.length}</span>
      )}
    </div>

    {mineError && mine.length === 0 ? (
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <span role="alert" className="text-xs text-[var(--osio-danger)]">Could not load invites.</span>
        <Button size="sm" onClick={onRetry}>Retry</Button>
      </div>
    ) : mineLoading && mine.length === 0 ? (
      <div className="space-y-2 px-2 py-2" aria-hidden="true">
        <div className="h-4 w-4/5 animate-pulse rounded-xs bg-[var(--osio-bg-muted)]" />
        <div className="h-11 w-full animate-pulse rounded-[var(--osio-radius-control)] bg-[var(--osio-bg-muted)]" />
      </div>
    ) : (
      <div className="max-h-[min(50vh,20rem)] overflow-y-auto">
        {mine.map((invite) => (
          <div key={invite.id} className="flex flex-col gap-2 px-2 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--osio-fg-default)] [overflow-wrap:anywhere]">
                {invite.workspaceName}
              </p>
              <p className="text-xs text-[var(--osio-fg-muted)] [overflow-wrap:anywhere]">
                {invite.inviterName} · {invite.role} · {inviteExpiryText(invite.expiresAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                tone="primary"
                disabled={busyInviteId !== null}
                onClick={() => onJoin(invite)}
                aria-label={`Join ${invite.workspaceName}`}
                className={INVITE_ACTION_CLASS}
              >
                {busyInviteId === invite.id ? "Joining…" : "Join"}
              </Button>
              <Button
                disabled={busyInviteId !== null}
                onClick={() => onDecline(invite)}
                aria-label={`Decline ${invite.workspaceName}`}
                className={INVITE_ACTION_CLASS}
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
