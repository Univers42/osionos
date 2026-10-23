/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiConnectionList.tsx                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Trash2 } from "lucide-react";

import type { AiConnection } from "@/features/ai/api/aiClient";
import { StatusChip } from "./aiConnectionControls";

/** The connections the user has, each with its test and remove controls. */
export const ConnectionList: React.FC<{
  own: AiConnection[];
  removing: string | null;
  setRemoving: (id: string | null) => void;
  busy: string;
  runTest: (id: string) => Promise<void>;
  runRemove: (id: string) => Promise<void>;
}> = ({ own, removing, setRemoving, busy, runTest, runRemove }) => (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-[var(--osio-fg-default)]">Your connections</h4>
        {own.length === 0 ? (
          <p className="text-sm text-[var(--osio-fg-muted)]">No connection of your own yet.</p>
        ) : (
          <div className="divide-y divide-[var(--osio-border-default)] rounded-lg border border-[var(--osio-border-default)]">
            {own.map((connection) => (
              <div key={connection.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--osio-fg-default)]">{connection.label}</div>
                  <div className="truncate text-xs text-[var(--osio-fg-muted)]">
                    {connection.provider}
                    {connection.last4 ? ` · ···· ${connection.last4}` : ""}
                    {connection.baseUrl ? ` · ${connection.baseUrl}` : ""}
                  </div>
                </div>
                <StatusChip connection={connection} />
                {removing === connection.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-[var(--osio-fg-muted)]">Remove this connection?</span>
                    <button
                      type="button"
                      onClick={() => void runRemove(connection.id)}
                      disabled={busy === `remove:${connection.id}`}
                      className="rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-danger)] hover:bg-[var(--osio-bg-hover)] disabled:opacity-50"
                    >
                      {busy === `remove:${connection.id}` ? "Removing…" : "Remove"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(null)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void runTest(connection.id)}
                      disabled={busy === `test:${connection.id}`}
                      className="rounded-md border border-[var(--osio-border-default)] px-2.5 py-1 text-xs font-medium text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)] disabled:opacity-50"
                    >
                      {busy === `test:${connection.id}` ? "Testing…" : "Test"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(connection.id)}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-[var(--osio-danger)] hover:bg-[var(--osio-bg-hover)]"
                    >
                      <Trash2 size={12} aria-hidden /> Remove
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
);
