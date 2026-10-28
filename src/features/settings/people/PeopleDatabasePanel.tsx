/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PeopleDatabasePanel.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Renders one People tab as a notion-database-sys view (single-view chrome)
 *  over a PeopleSourceAdapter, with a view toggle, a directory search box, a
 *  create button, and the PeoplePeek row actions. Mirrors WorkspaceDatabaseBlock. */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ObjectDatabase, type ObjectDatabaseProps } from "@notion-db/object-database";
import "@/app/styles/database-bridge.generated.css";
import "@/app/styles/database-overrides.css";
import { Button, Modal } from "@/shared/ui";
import { useToastStore } from "@osionos/ui/primitives";
import { useUserStore } from "@/features/auth";
import { useWorkspaceInvitesStore } from "@/store/settings";
import { PeopleSourceAdapter } from "./peopleSourceAdapter";
import { PEOPLE_SOURCES } from "./peopleSources";
import { PeoplePeek } from "./PeoplePeek";
import { createGroup, inviteGuest } from "./peopleActions";
import type { PeopleCtx, PeopleSourceKey } from "./peopleModel";
import { useCanInviteMembers } from "./useCanInviteMembers";
import { AcceptLinkModal, InviteError, InviteRoleSelect, PEOPLE_INPUT_CLASS as INPUT_CLASS, type InviteRole } from "./AcceptLinkModal";

interface PanelProps {
  source: PeopleSourceKey;
  /** Base context; the panel owns the directory search query. */
  ctx: Omit<PeopleCtx, "query">;
  onCountsChange?: () => void;
}


/** Create-flow modal — a group (chat/community) or an email invite. */
const CreatePeopleModal: React.FC<{
  kind: "group" | "guest"; workspaceId: string; invitedBy: string; onClose: () => void; onDone: () => void;
}> = ({ kind, workspaceId, invitedBy, onClose, onDone }) => {
  const [value, setValue] = useState("");
  const [groupKind, setGroupKind] = useState<"chat" | "community">("chat");
  const [role, setRole] = useState<InviteRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The accept link exists only now: the bridge keeps a hash, so closing this modal loses it.
  const [acceptLink, setAcceptLink] = useState<string | null>(null);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const email = value.trim();
    if (!email || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (kind === "group") {
        await createGroup(workspaceId, email, groupKind);
      } else {
        const created = await inviteGuest(workspaceId, email, role, invitedBy);
        if (!created) {
          // The store reverted its optimistic row: show why instead of closing as if it worked.
          setError(useWorkspaceInvitesStore.getState().error[workspaceId] ?? "Could not send the invite.");
          return;
        }
        const workspaceName = useUserStore.getState().activeWorkspace()?.name ?? "your workspace";
        useToastStore.getState().push({ kind: "success", title: `Invited ${email} to ${workspaceName}` });
        const link = useWorkspaceInvitesStore.getState().acceptLinks[created._id];
        if (link) {
          setAcceptLink(link);
          onDone();
          return;
        }
      }
      onDone();
      onClose();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Could not send the invite.");
    } finally { setBusy(false); }
  };

  if (acceptLink) return <AcceptLinkModal link={acceptLink} onClose={onClose} />;

  return (
    <Modal open onClose={onClose} size="sm" title={kind === "group" ? "New group" : "Invite people"}>
      <form className="space-y-3 p-6" onSubmit={submit}>
        <input autoFocus value={value} onChange={(event) => setValue(event.target.value)}
          placeholder={kind === "group" ? "Group name" : "guest@email.com"} className={INPUT_CLASS}
          aria-label={kind === "group" ? "Group name" : "Email address"} />
        {kind === "group" ? (
          <select value={groupKind} onChange={(event) => setGroupKind(event.target.value as "chat" | "community")} className={INPUT_CLASS}>
            <option value="chat">Group chat</option>
            <option value="community">Community</option>
          </select>
        ) : (
          <InviteRoleSelect value={role} onChange={setRole} allowAdmin ariaLabel="Role" />
        )}
        {error && kind !== "group" && <InviteError message={error} />}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" tone="primary" disabled={busy}>{busy ? "…" : kind === "group" ? "Create" : "Invite"}</Button>
        </div>
      </form>
    </Modal>
  );
};

export const PeopleDatabasePanel: React.FC<PanelProps> = ({ source, ctx, onCountsChange }) => {
  const descriptor = PEOPLE_SOURCES[source];
  const [viewId, setViewId] = useState(descriptor.views[0].id);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [creating, setCreating] = useState<"group" | "guest" | null>(null);
  const inviteRequested = useWorkspaceInvitesStore((state) => state.inviteRequested);
  // The sidebar's "Invite members" card opens Settings on People and asks this
  // panel to open the invite flow, whatever source tab is showing. Not in the
  // first commit: Modal portals into <body> and React places the deeper portal
  // first, so an invite modal mounted together with Settings sat UNDER it,
  // invisible and unclickable (public build, 2026-10-21). One frame later it
  // is appended after Settings and stacks on top.
  const [mountedFrame, setMountedFrame] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMountedFrame(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const canInvite = useCanInviteMembers(ctx.workspaceId, ctx.activeUserId);
  const activeCreating = creating ?? (inviteRequested && mountedFrame && canInvite ? "guest" : null);
  const closeCreate = () => {
    if (inviteRequested) useWorkspaceInvitesStore.getState().consumeInviteRequest();
    setCreating(null);
  };

  // The parent remounts this panel (key=source) when the tab changes, so view
  // and query reset via the useState initializers — no reset effect needed.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Rebuilds only on source/workspace/query change (ctx is a stable store selector).
  const adapter = useMemo(
    () => new PeopleSourceAdapter(() => descriptor.build({ ...ctx, query: debouncedQuery })),
    [descriptor, ctx, debouncedQuery],
  );

  const handleChanged = useCallback(() => { adapter.refresh(); onCountsChange?.(); }, [adapter, onCountsChange]);

  const renderPage = useCallback<NonNullable<ObjectDatabaseProps["renderPage"]>>(
    (pageId, state, onClose) => {
      const page = state.pages[pageId];
      if (!page) return null;
      return (
        <PeoplePeek source={source} page={page} workspaceId={ctx.workspaceId}
          connect={descriptor.connect} onClose={onClose} onChanged={handleChanged} />
      );
    },
    [source, ctx.workspaceId, descriptor, handleChanged],
  );

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {descriptor.views.length > 1 && (
          <div className="inline-flex rounded-md border border-[var(--osio-border-default)] p-0.5">
            {descriptor.views.map((entry) => (
              <button key={entry.id} type="button" onClick={() => setViewId(entry.id)}
                className={`rounded-xs px-2 py-1 text-xs ${viewId === entry.id ? "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)]"}`}>
                {entry.label}
              </button>
            ))}
          </div>
        )}
        {descriptor.search && (
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people"
            className={`${INPUT_CLASS} max-w-[240px]`} />
        )}
        {descriptor.create && (descriptor.create.kind !== "guest" || canInvite) && (
          <div className="ml-auto">
            <Button tone="primary" onClick={() => setCreating(descriptor.create!.kind)}>{descriptor.create.label}</Button>
          </div>
        )}
      </div>

      <ObjectDatabase key={`${viewId}:${debouncedQuery}`} adapter={adapter} databaseId={descriptor.databaseId}
        initialView={viewId} mode="inline" chrome="single-view" renderPage={renderPage} />

      {activeCreating && (
        <CreatePeopleModal kind={activeCreating} workspaceId={ctx.workspaceId} invitedBy={ctx.activeUserId}
          onClose={closeCreate} onDone={handleChanged} />
      )}
    </div>
  );
};
