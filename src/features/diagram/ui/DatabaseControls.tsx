/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabaseControls.tsx                                +:      :+:    :+:   */
/*                                                    copyrightc        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  licensed        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The controls of the two database kinds: the databases of a schema, the
 * database and the status column of a pipeline.
 *
 * They live BEHIND the lazy boundary of the store, because they read it: the
 * catalog comes from `DatabaseDiagram`, the one module of the feature that
 * reads the store — so the toolbar of a mermaid diagram never loads it.
 *
 * Choosing a kind writes a valid default of that kind: the first database for
 * a schema, the first database that HAS a status column for a pipeline. A
 * client with no database at all writes an empty list, and the spec says so.
 */

import React, { useEffect, useRef } from "react";

import { MAX_SCHEMA_DATABASES, type DiagramSpec } from "../model/diagramSpec";
import { useDatabaseCatalog, type CatalogEntry } from "./DatabaseDiagram";
import { CONTROL } from "./diagramControls";

/** The column a pipeline names: a status column, or any column at all. */
function groupableProperty(entry: CatalogEntry | undefined): string {
  if (!entry) return "";
  return entry.statusProperties[0]?.id ?? entry.propertyIds[0] ?? "";
}

/** The default spec of a schema: the first database of the client. */
function schemaDefault(catalog: CatalogEntry[]): Record<string, unknown> {
  const first = catalog[0];
  return { kind: "schema", databaseIds: first ? [first.id] : [] };
}

/**
 * The default spec of a pipeline: the first database that HAS a status column.
 *
 * A client whose databases hold no status column gets the first database it
 * has, with a column that is not a status: the spec stays valid, and the
 * pipeline then says it is not available — which is the truth.
 */
function pipelineDefault(catalog: CatalogEntry[]): Record<string, unknown> {
  const entry = catalog.find((candidate) => candidate.statusProperties.length > 0) ?? catalog[0];
  return {
    kind: "pipeline",
    databaseId: entry?.id ?? "",
    statusPropertyId: groupableProperty(entry),
  };
}

interface DatabaseControlsProps {
  /** The kind of diagram these controls edit. */
  kind: "schema" | "pipeline";
  /** The stored spec, when it is one of that kind. */
  spec: DiagramSpec | null;
  /** Write a new spec of that kind. */
  onChange: (next: Record<string, unknown>) => void;
}

/**
 * The controls of the two database kinds.
 *
 * Every control is labelled and reachable with the keyboard: the databases
 * are checkboxes in a fieldset, the database and the status column are
 * selects.
 */
export const DatabaseControls: React.FC<DatabaseControlsProps> = ({
  kind,
  spec,
  onChange,
}) => {
  const catalog = useDatabaseCatalog();
  const schemaSpec = kind === "schema" && spec?.kind === "schema" ? spec : null;
  const pipelineSpec = kind === "pipeline" && spec?.kind === "pipeline" ? spec : null;
  const written = useRef(false);

  // The DEFAULT of the kind, written once: a spec that is already there is
  // the author's, not ours. The ref keeps the write to ONE — a spec that does
  // not parse (a schema with no database) must not be written again and again.
  useEffect(() => {
    if (written.current || spec) return;
    written.current = true;
    onChange(kind === "schema" ? schemaDefault(catalog) : pipelineDefault(catalog));
  }, [kind, spec, catalog, onChange]);

  const checked = new Set(schemaSpec?.databaseIds ?? []);
  const atCap = checked.size >= MAX_SCHEMA_DATABASES;
  const toggle = (id: string, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(id);
    else next.delete(id);
    onChange({
      kind: "schema",
      databaseIds: catalog.filter((entry) => next.has(entry.id)).map((entry) => entry.id),
    });
  };

  const selectedId = pipelineSpec?.databaseId ?? "";
  const statusOptions = catalog.find((entry) => entry.id === selectedId)?.statusProperties ?? [];
  const statusPropertyId = pipelineSpec?.statusPropertyId ?? "";
  // The select offers the STATUS columns only: a column that is not one is not
  // a choice, so the select shows nothing rather than a lie.
  const statusValue = statusOptions.some((property) => property.id === statusPropertyId)
    ? statusPropertyId
    : "";
  const changeDatabase = (databaseId: string) => {
    const entry = catalog.find((candidate) => candidate.id === databaseId);
    const properties = entry?.statusProperties ?? [];
    const kept = properties.some((property) => property.id === statusPropertyId);
    onChange({
      kind: "pipeline",
      databaseId,
      statusPropertyId: kept ? statusPropertyId : groupableProperty(entry),
    });
  };

  if (kind === "schema") {
    return (
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="text-xs text-[var(--osio-fg-muted)]">Databases</legend>
        {catalog.map((entry) => (
          <label
            key={entry.id}
            className="flex items-center gap-1 text-xs text-[var(--osio-fg-default)]"
          >
            <input
              type="checkbox"
              checked={checked.has(entry.id)}
              disabled={!checked.has(entry.id) && atCap}
              onChange={(event) => toggle(entry.id, event.target.checked)}
            />
            {entry.name}
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <>
      <label className="flex items-center gap-1.5 text-xs text-[var(--osio-fg-muted)]">
        <span>Database</span>
        <select
          aria-label="Pipeline database"
          value={selectedId}
          onChange={(event) => changeDatabase(event.target.value)}
          className={CONTROL}
        >
          {catalog.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-[var(--osio-fg-muted)]">
        <span>Status</span>
        <select
          aria-label="Status property"
          value={statusValue}
          onChange={(event) =>
            onChange({
              kind: "pipeline",
              databaseId: selectedId,
              statusPropertyId: event.target.value,
            })
          }
          className={CONTROL}
        >
          {statusOptions.length > 0 ? (
            statusOptions.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))
          ) : (
            <option value="">No status column</option>
          )}
        </select>
      </label>
    </>
  );
};
