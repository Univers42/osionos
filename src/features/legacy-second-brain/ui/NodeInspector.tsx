/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   NodeInspector.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { GraphNode } from "../model/graphModel";

/**
 * The selected record's editable properties (doc 05 inspector + doc 02 writes).
 * Each field commits on blur/Enter via `onCommit`; the parent routes that to the
 * local store (local mode) or an atomic `/txn` batch (BaaS mode) with optimistic
 * apply. Rendered only for the selected node, so it stays free at rest.
 */

export interface InspectorProperty {
  key: string;
  label: string;
  value: string;
}

interface NodeInspectorProps {
  node: GraphNode;
  properties: InspectorProperty[];
  /** Write-consistency hint to show honestly (e.g. "atomic"); null hides it. */
  consistency: string | null;
  onCommit: (key: string, value: string) => void;
  /** Phase 5: promote a data record to a note overlay / demote it back. */
  onPromote?: () => void;
  onDemote?: () => void;
  /** Whether promotion is wired (BaaS mode). */
  promoteAvailable: boolean;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({ node, properties, consistency, onCommit, onPromote, onDemote, promoteAvailable }) => (
  <div className="flex flex-col gap-3">
    <div>
      <span className="text-[11px] uppercase tracking-wide text-[var(--osio-fg-subtle)]">
        {node.kind === "note" ? "Note" : node.databaseId ?? node.kind}
      </span>
      <h2 className="text-base font-semibold text-[var(--osio-fg-default)]">{node.label}</h2>
      {node.group ? <p className="text-[var(--osio-fg-muted)]">{node.group}</p> : null}
      {consistency ? (
        <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--osio-fg-subtle)]">
          writes: {consistency === "atomic" ? "atomic · same mount" : consistency}
        </p>
      ) : null}
    </div>

    {properties.length > 0 ? (
      <dl className="flex flex-col gap-1.5">
        {properties.map((property) => (
          <EditableField
            key={property.key}
            label={property.label}
            value={property.value}
            onCommit={(value) => onCommit(property.key, value)}
          />
        ))}
      </dl>
    ) : (
      <p className="text-[var(--osio-fg-muted)]">No editable properties.</p>
    )}

    <NoteAction node={node} onPromote={onPromote} onDemote={onDemote} promoteAvailable={promoteAvailable} />
  </div>
);

const NoteAction: React.FC<Pick<NodeInspectorProps, "node" | "onPromote" | "onDemote" | "promoteAvailable">> = ({ node, onPromote, onDemote, promoteAvailable }) => {
  if (node.kind === "note") {
    return <p className="mt-2 text-xs text-[var(--osio-fg-muted)]">Note overlay — edit its text in the fields above.</p>;
  }
  if (node.hasNote && onDemote) {
    return <ActionButton label="Remove note" onClick={onDemote} />;
  }
  if (promoteAvailable && onPromote) {
    return <ActionButton label="Convert to note" onClick={onPromote} />;
  }
  return (
    <button
      type="button"
      disabled
      title="Available when the BaaS graph is connected"
      className="mt-2 cursor-not-allowed rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-xs text-[var(--osio-fg-muted)]"
    >
      Convert to note
    </button>
  );
};

const ActionButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-2 rounded-md border border-[var(--osio-border-default)] px-3 py-1.5 text-xs text-[var(--osio-fg-default)] transition-colors hover:border-[var(--osio-accent)] hover:text-[var(--osio-accent)]"
  >
    {label}
  </button>
);

const EditableField: React.FC<{ label: string; value: string; onCommit: (value: string) => void }> = ({ label, value, onCommit }) => (
  // Uncontrolled: typing never re-renders the tree; `key={value}` resets the
  // field when the committed value changes externally (avoids a sync effect).
  <div className="flex items-center justify-between gap-3">
    <span className="shrink-0 text-[var(--osio-fg-subtle)]">{label}</span>
    <input
      key={value}
      defaultValue={value}
      onBlur={(event) => { if (event.target.value !== value) onCommit(event.target.value); }}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-[var(--osio-fg-default)] outline-none hover:border-[var(--osio-border-default)] focus:border-[var(--osio-accent)]"
    />
  </div>
);
