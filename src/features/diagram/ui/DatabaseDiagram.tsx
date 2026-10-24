/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   DatabaseDiagram.tsx                                 +:      :+:    :+:   */
/*                                                    copyrightc        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  licensed        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The two diagram kinds that are drawn from the databases the VIEWER holds.
 *
 * This module is the ONLY one of the feature that reads the database store,
 * and that store ships the seed of the app — a big chunk. So it is loaded
 * LAZILY: a hand-written mermaid diagram and a page tree never pay for it
 * (the block reaches this file through a dynamic import, and only for the two
 * database kinds).
 *
 * A diagram is never stored: the spec names a database, and the diagram is
 * compiled again, from the state of the moment. A database the viewer does not
 * hold is not drawn — not even as an unnamed node — and a database id never
 * reaches the text (the emitter writes `n0`, `n1`, …).
 *
 * The catalog of the client lives here too, because it is read from the same
 * store: the controls of the two kinds borrow it (see `DatabaseControls`).
 */

import React, { useEffect, useMemo } from "react";

import { useKnownDatabaseStateStore } from "@/widgets/database-view/model/knownDatabaseState";

import { statusProperties } from "../model/databaseInput";
import { databaseSource } from "../model/databaseSource";
import { compareByText } from "../model/diagramIR";
import type { DiagramSource } from "../model/diagramSource";
import { DiagramOutput } from "./DiagramOutput";

/** One database of the client: its name, its columns, and the ones a pipeline may group by. */
export interface CatalogEntry {
  id: string;
  name: string;
  /** The columns a pipeline may group its rows by. */
  statusProperties: { id: string; name: string }[];
  /** Every column of the database, in the order of the schema. */
  propertyIds: string[];
}

/**
 * The databases the client holds, in a stable order (by name, then by id).
 *
 * The list is the editor's: the schema checkboxes and the pipeline selects
 * name the databases by name, so the same state always offers the same list.
 */
export function useDatabaseCatalog(): CatalogEntry[] {
  const databases = useKnownDatabaseStateStore((store) => store.state.databases);
  return useMemo(
    () =>
      Object.values(databases)
        .map((database) => ({
          id: database.id,
          name: database.name,
          statusProperties: statusProperties(database),
          propertyIds: Object.values(database.properties).map((property) => property.id),
        }))
        .sort((left, right) => compareByText(left.name, left.id, right.name, right.id)),
    [databases],
  );
}

interface DatabaseDiagramProps {
  /** The stored spec: a schema or a pipeline. */
  spec: unknown;
  /** Report the compiled mermaid, for the export of the block. */
  onSource?: (source: string | null) => void;
}

/**
 * A schema or a pipeline, drawn from the databases of the moment.
 *
 * The source is computed from the spec and the client's own state: a renamed
 * database redraws, and a database the viewer may not read is not drawn.
 */
export const DatabaseDiagram: React.FC<DatabaseDiagramProps> = ({ spec, onSource }) => {
  const databases = useKnownDatabaseStateStore((store) => store.state.databases);
  const pages = useKnownDatabaseStateStore((store) => store.state.pages);
  const output = useMemo<DiagramSource>(
    () => databaseSource(spec, databases, pages),
    [spec, databases, pages],
  );
  // The compiled text goes up to the block: it is what the export copies.
  useEffect(() => {
    onSource?.(output.source);
  }, [output, onSource]);
  return <DiagramOutput {...output} />;
};
