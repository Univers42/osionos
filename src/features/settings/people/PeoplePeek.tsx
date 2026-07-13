/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PeoplePeek.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The row peek (renderPage) for every People source. It is the single place
 *  CRUD happens: each button calls an existing client via peopleActions, then
 *  refreshes the view. Destructive actions arm a one-click confirm first. */

import React, { useState } from "react";
import { Button, Modal } from "@/shared/ui";
import { isVideoCoverSource } from "@/entities/page/ui/coverMedia";
import type { Page } from "@notion-db/object-database";
import type { WorkspaceMemberRole } from "@/store/settings";
import { CONTACT, DIR, GROUP, GUEST, MEMBER, type PeopleSourceKey } from "./peopleModel";
import {
  changeMemberRole, connectPerson, messagePerson, removeContact, removeMember, revokeGuest, transferOwnership,
} from "./peopleActions";

interface PeekProps {
  source: PeopleSourceKey;
  page: Page;
  workspaceId: string;
  connect?: boolean;
  onClose: () => void;
  onChanged: () => void;
}

/** A destructive button that arms a confirm on first click. */
const ConfirmButton: React.FC<{ label: string; busyLabel?: string; onConfirm: () => Promise<unknown> }> = ({ label, onConfirm }) => {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Button tone="danger" disabled={busy} onClick={async () => {
      if (!armed) { setArmed(true); return; }
      setBusy(true);
      try { await onConfirm(); } finally { setBusy(false); }
    }}>{busy ? "…" : armed ? `Confirm ${label.toLowerCase()}` : label}</Button>
  );
};

const ROLE_CHOICES: Array<Exclude<WorkspaceMemberRole, "owner">> = ["admin", "member", "guest"];

export const PeoplePeek: React.FC<PeekProps> = ({ source, page, workspaceId, connect, onClose, onChanged }) => {
  const props = page.properties;
  const done = (work: Promise<unknown>) => { void work.then(() => onChanged()).finally(() => onClose()); };

  const title = String(
    props[CONTACT.name] ?? props[DIR.name] ?? props[GROUP.name] ?? props[GUEST.email] ?? props[MEMBER.name] ?? "—",
  );
  const subtitle = String(props[CONTACT.headline] ?? props[DIR.headline] ?? props[GROUP.kind] ?? props[GUEST.role] ?? props[MEMBER.role] ?? "");

  return (
    <Modal open onClose={onClose} size="sm" title={title}>
      <div className="p-6">
        <div className="flex items-center gap-3">
          {page.cover && !isVideoCoverSource(page.cover)
            ? <img src={page.cover} alt="" className="h-12 w-12 rounded-full object-cover" />
            : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--osio-bg-subtle)] text-lg">{page.icon ?? title.charAt(0).toUpperCase()}</div>}
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-[var(--osio-fg-default)]">{title}</div>
            {subtitle && <div className="truncate text-sm text-[var(--osio-fg-muted)]">{subtitle}</div>}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {source === "contacts" && (<>
            <Button tone="primary" onClick={() => done(messagePerson(String(props[CONTACT.peer] ?? ""), workspaceId))}>Message</Button>
            <ConfirmButton label="Remove contact" onConfirm={() => removeContact(page.id)} />
          </>)}

          {source === "directory" && connect && (
            <Button tone="primary" onClick={() => done(connectPerson(page.id))}>Connect</Button>
          )}

          {source === "guests" && (
            <ConfirmButton label="Revoke invite" onConfirm={() => revokeGuest(workspaceId, page.id)} />
          )}

          {source === "members" && (<>
            {ROLE_CHOICES.map((role) => (
              <Button key={role} tone={props[MEMBER.role] === role ? "primary" : "default"}
                onClick={() => done(changeMemberRole(workspaceId, page.id, role))}>{role}</Button>
            ))}
            <ConfirmButton label="Transfer ownership" onConfirm={() => transferOwnership(workspaceId, page.id)} />
            <ConfirmButton label="Remove member" onConfirm={() => removeMember(workspaceId, page.id)} />
          </>)}

          {source === "groups" && (
            <span className="text-sm text-[var(--osio-fg-muted)]">Your role: {String(props[GROUP.role] ?? "member")}</span>
          )}
        </div>
      </div>
    </Modal>
  );
};
