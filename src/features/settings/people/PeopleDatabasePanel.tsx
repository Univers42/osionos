/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   PeopleDatabasePanel.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Renders one People tab as a notion-database-sys view (single-view chrome)
 *  over a PeopleSourceAdapter, with a view toggle, a directory search box, a
 *  create button, and the PeoplePeek row actions. Mirrors WorkspaceDatabaseBlock. */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ObjectDatabase, type ObjectDatabaseProps } from "@notion-db/object-database";
import { Button, Modal } from "@/shared/ui";
import type { WorkspaceMemberRole } from "@/store/settings";
import { PeopleSourceAdapter } from "./peopleSourceAdapter";
import { PEOPLE_SOURCES } from "./peopleSources";
import { PeoplePeek } from "./PeoplePeek";
import { createGroup, inviteGuest } from "./peopleActions";
import type { PeopleCtx, PeopleSourceKey } from "./peopleModel";

const INPUT_CLASS =
  "h-9 w-full rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-subtle)] px-3 text-sm outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]";

interface PanelProps {
  source: PeopleSourceKey;
  /** Base context; the panel owns the directory search query. */
  ctx: Omit<PeopleCtx, "query">;
  onCountsChange?: () => void;
}

/** Create-flow modal — a group (chat/community) or a guest invite by email. */
const CreatePeopleModal: React.FC<{
  kind: "group" | "guest"; workspaceId: string; invitedBy: string; onClose: () => void; onDone: () => void;
}> = ({ kind, workspaceId, invitedBy, onClose, onDone }) => {
  const [value, setValue] = useState("");
  const [groupKind, setGroupKind] = useState<"chat" | "community">("chat");
  const [role, setRole] = useState<Exclude<WorkspaceMemberRole, "owner">>("guest");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      if (kind === "group") await createGroup(workspaceId, value.trim(), groupKind);
      else await inviteGuest(workspaceId, value.trim(), role, invitedBy);
      onDone();
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title={kind === "group" ? "New group" : "Invite guest"}>
      <div className="space-y-3 p-6">
        <input autoFocus value={value} onChange={(event) => setValue(event.target.value)}
          placeholder={kind === "group" ? "Group name" : "guest@email.com"} className={INPUT_CLASS} />
        {kind === "group" ? (
          <select value={groupKind} onChange={(event) => setGroupKind(event.target.value as "chat" | "community")} className={INPUT_CLASS}>
            <option value="chat">Group chat</option>
            <option value="community">Community</option>
          </select>
        ) : (
          <select value={role} onChange={(event) => setRole(event.target.value as Exclude<WorkspaceMemberRole, "owner">)} className={INPUT_CLASS}>
            <option value="guest">Guest</option>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={busy} onClick={submit}>{busy ? "…" : kind === "group" ? "Create" : "Invite"}</Button>
        </div>
      </div>
    </Modal>
  );
};

export const PeopleDatabasePanel: React.FC<PanelProps> = ({ source, ctx, onCountsChange }) => {
  const descriptor = PEOPLE_SOURCES[source];
  const [viewId, setViewId] = useState(descriptor.views[0].id);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [creating, setCreating] = useState(false);

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
                className={`rounded px-2 py-1 text-xs ${viewId === entry.id ? "bg-[var(--osio-bg-subtle)] text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)]"}`}>
                {entry.label}
              </button>
            ))}
          </div>
        )}
        {descriptor.search && (
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people"
            className={`${INPUT_CLASS} max-w-[240px]`} />
        )}
        {descriptor.create && (
          <div className="ml-auto">
            <Button tone="primary" onClick={() => setCreating(true)}>{descriptor.create.label}</Button>
          </div>
        )}
      </div>

      <ObjectDatabase key={`${viewId}:${debouncedQuery}`} adapter={adapter} databaseId={descriptor.databaseId}
        initialView={viewId} mode="inline" chrome="single-view" renderPage={renderPage} />

      {creating && descriptor.create && (
        <CreatePeopleModal kind={descriptor.create.kind} workspaceId={ctx.workspaceId} invitedBy={ctx.activeUserId}
          onClose={() => setCreating(false)} onDone={handleChanged} />
      )}
    </div>
  );
};
