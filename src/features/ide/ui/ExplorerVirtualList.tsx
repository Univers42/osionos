/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ExplorerVirtualList.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import type { Virtualizer } from "@tanstack/react-virtual";

import { renderRowKey, type RenderRow } from "../model/explorerRows";
import { ExplorerCreateRow, ExplorerHintRow, ExplorerStatusRow, type LinePlacement, WorkspaceExplorerRow } from "./WorkspaceExplorerRow";

type Props = {
  rows: readonly RenderRow[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  /** The sidebar shares its native scroll surface with Recents; its rows stay in document flow. */
  virtualized?: boolean;
};

function renderRow(row: RenderRow, key: string, placement?: LinePlacement): React.ReactNode {
  if (row.type === "item") return <WorkspaceExplorerRow key={key} item={row.item} placement={placement} />;
  if (row.type === "status") return <ExplorerStatusRow key={key} dir={row.dir} level={row.level} placement={placement} />;
  if (row.type === "hint") return <ExplorerHintRow key={key} text={row.text} level={row.level} placement={placement} />;
  return <ExplorerCreateRow key={key} level={row.level} kind={row.kind} placement={placement} />;
}

/** The workspace tree as one flat, keyboard-navigable WAI-ARIA tree. Large editor trees
 *  may be virtualized; the sidebar keeps its small navigation list in normal document flow. */
export const ExplorerVirtualList: React.FC<Props> = ({ rows, virtualizer, virtualized = true }) => (
  <ul
    role="tree"
    aria-label="Workspace files"
    className={virtualized ? "relative m-0 p-0" : "m-0 p-0"}
    style={virtualized ? { height: virtualizer.getTotalSize() } : undefined}
  >
    {virtualized
      ? virtualizer.getVirtualItems().map((line) => {
          const row = rows[line.index];
          if (!row) return null;
          const placement: LinePlacement = { index: line.index, start: line.start, measure: virtualizer.measureElement };
          return renderRow(row, line.key, placement);
        })
      : rows.map((row) => renderRow(row, renderRowKey(row)))}
  </ul>
);
