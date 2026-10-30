/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SysDatabaseBlock.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import React from "react";
import type { ObjectDatabaseAdapter, ObjectDatabaseProps } from "@notion-db/object-database";

import { API_BASE } from "@/shared/api/client";
import { useHasBeenNearViewport } from "@/shared/lib/dom/useHasBeenNearViewport";
import { withRecordLimit } from "../model/recordLimitAdapter";
import { sysSourceById } from "../model/sysDataSources";
import { getSysDatabaseAdapter, type SysStatus } from "../model/sysDatabaseState";
import { sysTransport } from "../model/sysDatabaseTransport";
import { WorkspaceRecordPeek } from "./WorkspaceDatabaseBlock";
import { databaseShellClass } from "../model/databaseShellClass";

interface SysDatabaseBlockProps {
  databaseId: string;
  initialViewId?: string;
  mode?: "inline" | "full";
  recordLimit?: number;
  /** The host renders the ObjectDatabase (DatabaseBlock owns its bridge CSS and host adapters). */
  renderDatabase: (props: {
    adapter: ObjectDatabaseAdapter; initialView?: string; renderPage?: ObjectDatabaseProps["renderPage"]; key: number;
  }) => React.ReactNode;
}

const OK_STATUS: SysStatus = { truncated: false, error: null };

/** A `sys:` database: your own data from the bridge, read-only. A failed read shows an
 *  error with Retry; it never falls back to demo rows. A build with no server never
 *  tries the read: it asks you to connect. Nothing is read until the block nears the
 *  viewport: a background pane or a block below the fold costs no request at sign-in. */
export const SysDatabaseBlock: React.FC<SysDatabaseBlockProps> = ({ databaseId, initialViewId, mode = "inline", recordLimit, renderDatabase }) => {
  const source = sysSourceById(databaseId);
  const adapter = React.useMemo(() => getSysDatabaseAdapter(databaseId, sysTransport), [databaseId]);
  const limited = React.useMemo(() => withRecordLimit(adapter, recordLimit), [adapter, recordLimit]);
  const [status, setStatus] = React.useState<SysStatus>(OK_STATUS);
  const [attempt, setAttempt] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const isNear = useHasBeenNearViewport(rootRef);
  React.useEffect(() => adapter.watchStatus(setStatus), [adapter]);

  const view = initialViewId && source && initialViewId.startsWith(`${source.source}-`) ? initialViewId : source?.defaultViewId;
  // Only my-pages records are real osionos pages; the other rows have no page to open.
  const renderPage = React.useCallback<NonNullable<ObjectDatabaseProps["renderPage"]>>(
    (pageId, _state, onClose) => <WorkspaceRecordPeek pageId={pageId} onClose={onClose} />,
    [],
  );
  const retry = (): void => { setStatus(OK_STATUS); setAttempt((n) => n + 1); };

  return (
    <div
      ref={rootRef}
      className={databaseShellClass(mode)}
      data-database-id={databaseId}
      data-database-view-id={view}
    >
      {!API_BASE || status.error ? (
        <div role="alert" className="flex items-center gap-3 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-4 py-3 text-sm text-[var(--osio-fg-default)]">
          <span>Connect to see your {source?.label.replace(/^My\s+/i, "").toLowerCase() ?? "data"}.</span>
          {API_BASE ? (
            <button type="button" className="rounded-md px-2 py-1 text-sm text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]" onClick={retry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : !isNear ? null : (
        renderDatabase({
          adapter: limited,
          initialView: view,
          renderPage: source?.source === "my-pages" ? renderPage : undefined,
          key: attempt,
        })
      )}
      {status.truncated ? (
        <p className="m-0 px-1 pt-1 text-xs text-[var(--osio-fg-muted)]">Showing your 200 most recent.</p>
      ) : null}
    </div>
  );
};
