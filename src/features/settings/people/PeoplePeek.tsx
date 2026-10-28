/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PeoplePeek.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** The row peek (renderPage) for every People source. It is the single place
 *  CRUD happens: each button calls an existing client via peopleActions, then
 *  refreshes the view. Destructive actions arm a one-click confirm first.
 *  The same person card (presence, status, follow) backs PeopleHovercard, the
 *  light version that opens from a name in a list.
 *
 *  Caveat: the hovercard timers are fixed delays, so a very slow pointer can
 *  see the card close while crossing the gap between name and card; keyboard
 *  focus has no such delay. */

import React, { useEffect, useRef, useState } from "react";
import { Button, IconValueView, Input, Modal } from "@/shared/ui";
import { useToastStore } from "@osionos/ui/primitives";
import { isVideoCoverSource } from "@/entities/page/ui/coverMedia";
import type { Page } from "@notion-db/object-database";
import { useUserStore } from "@/features/auth";
import { useWorkspaceMemberAttributesStore } from "@/store/settings";
import { validateName, validateValue } from "@/shared/lib/memberAttribute";
import { TypedConfirmModal } from "../ui/ConfirmModals";
import { isWorkspaceOwner } from "../model/workspaceOwnership";
import { useHovercardsEnabled } from "@/shared/config/useAppearance";
import { CONTACT_SOURCE } from "./contactsSource";
import { CONTACT, DIR, GROUP, GUEST, MEMBER, type PeopleSourceKey } from "./peopleModel";
import {
  changeMemberRole, connectPerson, inviteContact, messagePerson, removeContact, removeMember, revokeGuest, transferOwnership,
} from "./peopleActions";
import { AcceptLinkModal, InviteError, InviteRoleSelect, type InviteRole } from "./AcceptLinkModal";
import { presenceLabel, type PresenceState } from "./peopleSocialModel";
import { useCanInviteMembers } from "./useCanInviteMembers";
import { usePersonSocial } from "./usePersonSocial";

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

const ROLE_CHOICES: InviteRole[] = ["admin", "member", "guest"];
const EMPTY_ATTRIBUTES: { name: string; value: string }[] = [];

export interface PersonSummary {
  id: string;
  name: string;
  headline?: string | null;
  avatar?: string | null;
}

const PRESENCE_DOT: Record<PresenceState, string> = {
  online: "bg-[var(--osio-success)]",
  away: "bg-[var(--osio-warning)]",
  dnd: "bg-[var(--osio-danger)]",
  invisible: "bg-[var(--osio-fg-subtle)]",
  offline: "bg-[var(--osio-fg-subtle)]",
};

/** The state is always written out: the dot alone would be colour-only. */
const PresenceBadge: React.FC<{ state: PresenceState; note: string | null }> = ({ state, note }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--osio-fg-muted)]" data-presence={state}>
    <span aria-hidden className={`h-2 w-2 rounded-full ${PRESENCE_DOT[state]}`} />
    {presenceLabel(state)}{note ? ` · ${note}` : ""}
  </span>
);

/** Presence, status, counts and the follow button of one person. Renders nothing
 *  of its own when the build has no bridge, or for the viewer's own row. */
const PersonCardBody: React.FC<{ person: PersonSummary }> = ({ person }) => {
  const viewerId = useUserStore((state) => state.activeUserId);
  const social = usePersonSocial(person.id, person.id !== viewerId);
  if (!social.available) return null;
  const { card, follow } = social;
  const status = card?.status ?? null;
  return (
    <div className="mt-3 space-y-2" data-person-card={person.id}>
      {card && <PresenceBadge state={card.presence.state} note={card.presence.customText} />}
      {status && (
        <div className="text-sm text-[var(--osio-fg-default)]" data-person-status>
          {status.emoji ? `${status.emoji} ` : ""}{status.text}{status.busy ? " (busy)" : ""}
        </div>
      )}
      {follow && (
        <div className="flex items-center gap-3">
          <Button tone={follow.following ? "default" : "primary"} aria-pressed={follow.following} onClick={social.toggle}>
            {follow.following ? "Following" : "Follow"}
          </Button>
          <span className="text-xs text-[var(--osio-fg-muted)]">
            {follow.followerCount} followers · {follow.followingCount} following
          </span>
        </div>
      )}
      {social.notice && <p role="status" className="text-xs text-[var(--osio-danger)]">{social.notice}</p>}
    </div>
  );
};

const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 200;

/** A name that opens the person's card. With the hovercards preference on it opens
 *  on hover, and always on keyboard focus or click; Escape closes it. */
export const PeopleHovercard: React.FC<{ person: PersonSummary; children: React.ReactNode }> = ({ person, children }) => {
  const hoverEnabled = useHovercardsEnabled();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const later = (next: boolean, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  };
  const now = (next: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") now(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <span ref={root} className="relative inline-block"
      onMouseEnter={hoverEnabled ? () => later(true, HOVER_OPEN_MS) : undefined}
      onMouseLeave={hoverEnabled ? () => later(false, HOVER_CLOSE_MS) : undefined}
      onFocus={() => now(true)}
      onBlur={(event) => { if (!root.current?.contains(event.relatedTarget as Node | null)) now(false); }}>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => now(true)}
        className="rounded-xs text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]">
        {children}
      </button>
      {open && (
        <div role="dialog" aria-label={`${person.name}, profile`}
          className="absolute left-0 top-full z-[var(--osio-z-popover)] mt-1 w-72 rounded-lg border border-[var(--osio-overlay-border)] bg-[var(--osio-overlay-bg)] p-3 shadow-[var(--osio-shadow-menu)]">
          <div className="flex items-center gap-3">
            {person.avatar
              ? <img src={person.avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
              : <div aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--osio-bg-subtle)]">{person.name.charAt(0).toUpperCase()}</div>}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--osio-fg-default)]">{person.name}</div>
              {person.headline && <div className="truncate text-xs text-[var(--osio-fg-muted)]">{person.headline}</div>}
            </div>
          </div>
          <PersonCardBody person={person} />
        </div>
      )}
    </span>
  );
};

/** The manual-contact invite (C653): reveal a role picker, send, then the one-time link.
 *  The bridge is the gate — a refusal (not_connected, already_member…) shows its message
 *  inline; the accept link exists only now, so it is shown the moment it arrives. */
const ContactInvite: React.FC<{
  workspaceId: string;
  personId: string;
  name: string;
  workspaceName: string;
  /** Only the workspace owner may offer the admin role — same check as transfer below. */
  canGrantAdmin: boolean;
  onInvited: () => void;
}> = ({ workspaceId, personId, name, workspaceName, canGrantAdmin, onInvited }) => {
  const [picking, setPicking] = useState(false);
  const [role, setRole] = useState<InviteRole>("member");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [acceptUrl, setAcceptUrl] = useState<string | null>(null);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const invited = await inviteContact(workspaceId, personId, role);
      useToastStore.getState().push({ kind: "success", title: `Invited ${name} to ${workspaceName}` });
      if (invited.acceptUrl) setAcceptUrl(invited.acceptUrl);
      else onInvited(); // a bridge with no link key yet: the toast is the whole success
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not send the invite.");
    } finally {
      setBusy(false);
    }
  };

  if (acceptUrl) return <AcceptLinkModal link={acceptUrl} onClose={onInvited} />;
  return (
    <div className="mt-3 space-y-2" data-contact-invite={personId}>
      {picking ? (<>
        <label className="block space-y-1 text-sm">
          <span>Role in {workspaceName}</span>
          <InviteRoleSelect value={role} onChange={setRole} allowAdmin={canGrantAdmin} disabled={busy} />
        </label>
        <div className="flex gap-2">
          <Button tone="primary" disabled={busy} onClick={() => void send()}>{busy ? "…" : "Send invite"}</Button>
          <Button disabled={busy} onClick={() => setPicking(false)}>Cancel</Button>
        </div>
      </>) : (
        <Button onClick={() => setPicking(true)}>Invite to workspace</Button>
      )}
      {notice && <InviteError message={notice} />}
    </div>
  );
};

export const PeoplePeek: React.FC<PeekProps> = ({ source, page, workspaceId, connect, onClose, onChanged }) => {
  const props = page.properties;
  const viewerId = useUserStore((state) => state.activeUserId);
  const workspace = useUserStore((state) =>
    [...(state.activeSession()?.privateWorkspaces ?? []), ...(state.activeSession()?.sharedWorkspaces ?? [])]
      .find((entry) => entry._id === workspaceId));
  const isViewerOwner = isWorkspaceOwner(workspace, viewerId);
  const isAdmin = isViewerOwner || workspace?.role === 'admin';
  const isSelf = page.id === viewerId;
  const canViewAttributes = source === 'members' && (isAdmin || isSelf);
  const canManageAttributes = source === 'members' && isAdmin;
  const canInvite = useCanInviteMembers(workspaceId, viewerId);
  const hydrateAttributes = useWorkspaceMemberAttributesStore((state) => state.hydrate);
  const attributes = useWorkspaceMemberAttributesStore((state) => state.data[`${workspaceId}:${page.id}`] ?? EMPTY_ATTRIBUTES);
  const attrLoading = useWorkspaceMemberAttributesStore((state) => state.loading[`${workspaceId}:${page.id}`] ?? false);
  const attrError = useWorkspaceMemberAttributesStore((state) => state.error[`${workspaceId}:${page.id}`] ?? null);
  const setAttribute = useWorkspaceMemberAttributesStore((state) => state.set);
  const removeAttribute = useWorkspaceMemberAttributesStore((state) => state.remove);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrValue, setNewAttrValue] = useState('');
  const [attrFormError, setAttrFormError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  useEffect(() => {
    if (!canViewAttributes) return;
    void hydrateAttributes(workspaceId, page.id);
  }, [canViewAttributes, hydrateAttributes, page.id, workspaceId]);
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);
  const done = (work: Promise<unknown>) => { void work.then(() => onChanged()).finally(() => onClose()); };

  const title = String(
    props[CONTACT.name] ?? props[DIR.name] ?? props[GROUP.name] ?? props[GUEST.email] ?? props[MEMBER.name] ?? "—",
  );
  const subtitle = String(props[CONTACT.headline] ?? props[DIR.headline] ?? props[GROUP.kind] ?? props[GUEST.role] ?? props[MEMBER.role] ?? "");

  const personId = source === "contacts" ? String(props[CONTACT.peer] ?? "") : source === "directory" || source === "members" ? page.id : "";
  // Only a manual edge is a friendship the invite flow may act on (C653); the bridge
  // itself refuses everything else, so the colleague case explains instead of offering.
  const contactSource = String(props[CONTACT_SOURCE] ?? "manual");
  return (
    <Modal open onClose={onClose} size="sm" title={title}>
      <div className="p-6">
        <div className="flex items-center gap-3">
          {page.cover && !isVideoCoverSource(page.cover)
            ? <img src={page.cover} alt="" className="h-12 w-12 rounded-full object-cover" />
            : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--osio-bg-subtle)] text-lg">{page.icon ? <IconValueView value={page.icon} size={18} /> : title.charAt(0).toUpperCase()}</div>}
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-[var(--osio-fg-default)]">{title}</div>
            {subtitle && <div className="truncate text-sm text-[var(--osio-fg-muted)]">{subtitle}</div>}
          </div>
        </div>

        {personId && <PersonCardBody person={{ id: personId, name: title }} />}

        {canViewAttributes && (
          <section className="mt-5 space-y-3" aria-labelledby="member-attributes-heading" data-member-attributes>
            <h4 id="member-attributes-heading" className="text-sm font-semibold" style={{ color: 'var(--osio-fg-default)' }}>Attributes</h4>
            {attrLoading && <p className="text-xs" style={{ color: 'var(--osio-fg-muted)' }}>Loading attributes…</p>}
            {attrError && <p role="alert" className="text-xs" style={{ color: 'var(--osio-danger)' }}>{attrError}</p>}
            {attributes.length === 0 && !attrLoading && (
              <p className="text-xs" style={{ color: 'var(--osio-fg-muted)' }}>No attributes.</p>
            )}
            <ul className="space-y-2">
              {attributes.map((attribute) => (
                <li key={attribute.name} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--osio-fg-default)' }}>{attribute.name}</span>
                  <span className="text-sm" style={{ color: 'var(--osio-fg-muted)' }}>=</span>
                  {canManageAttributes && editingName === attribute.name ? (
                    <>
                      <Input
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        aria-label={`Value for ${attribute.name}`}
                        className="min-w-0 flex-1"
                      />
                      <Button tone="primary" onClick={() => {
                        const error = validateValue(editingValue);
                        if (error) { setAttrFormError(error); return; }
                        setAttrFormError(null);
                        void setAttribute(workspaceId, page.id, attribute.name, editingValue).then(() => setEditingName(null));
                      }}>Save</Button>
                      <Button onClick={() => setEditingName(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm" style={{ color: 'var(--osio-fg-default)' }}>{attribute.value}</span>
                      {canManageAttributes && (
                        <>
                          <Button onClick={() => { setEditingName(attribute.name); setEditingValue(attribute.value); setAttrFormError(null); }}>Edit</Button>
                          <Button tone="danger" onClick={() => void removeAttribute(workspaceId, page.id, attribute.name)}>Remove</Button>
                        </>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {canManageAttributes && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={newAttrName}
                    onChange={(event) => setNewAttrName(event.target.value)}
                    placeholder="name"
                    aria-label="New attribute name"
                    className="min-w-0 flex-1"
                  />
                  <Input
                    value={newAttrValue}
                    onChange={(event) => setNewAttrValue(event.target.value)}
                    placeholder="value"
                    aria-label="New attribute value"
                    className="min-w-0 flex-1"
                  />
                  <Button tone="primary" onClick={() => {
                    const nameError = validateName(newAttrName);
                    const valueError = validateValue(newAttrValue);
                    if (nameError || valueError) { setAttrFormError(nameError ?? valueError); return; }
                    setAttrFormError(null);
                    void setAttribute(workspaceId, page.id, newAttrName.trim(), newAttrValue.trim()).then(() => {
                      setNewAttrName('');
                      setNewAttrValue('');
                    });
                  }}>Add</Button>
                </div>
                {attrFormError && <p role="alert" className="text-xs" style={{ color: 'var(--osio-danger)' }}>{attrFormError}</p>}
              </div>
            )}
          </section>
        )}

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
            {isViewerOwner && page.id !== viewerId && <Button tone="danger" onClick={() => setConfirmingTransfer(true)}>Transfer ownership</Button>}
            <ConfirmButton label="Remove member" onConfirm={() => removeMember(workspaceId, page.id)} />
          </>)}

          {source === "groups" && (
            <span className="text-sm text-[var(--osio-fg-muted)]">Your role: {String(props[GROUP.role] ?? "member")}</span>
          )}
        </div>

        {source === "contacts" && canInvite && (contactSource === "manual" ? (
          <ContactInvite workspaceId={workspaceId} personId={personId} name={title}
            workspaceName={workspace?.name ?? "your workspace"} canGrantAdmin={isViewerOwner}
            onInvited={() => { onChanged(); onClose(); }} />
        ) : (
          <p className="mt-3 text-sm text-osio-fg-muted">Only people you connected with yourself can be invited.</p>
        ))}
      </div>
      {confirmingTransfer && (
        <TypedConfirmModal title="Transfer ownership" message={`Type ${title} to make them the owner. You stay on as an admin.`} confirmText={title} danger
          actionLabel="Transfer ownership" onConfirm={() => transferOwnership(workspaceId, page.id).then(() => { onChanged(); onClose(); })}
          onClose={() => setConfirmingTransfer(false)} />
      )}
    </Modal>
  );
};
