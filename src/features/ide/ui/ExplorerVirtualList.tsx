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

import type { RenderRow } from "../model/explorerRows";
import { ExplorerCreateRow, ExplorerStatusRow, WorkspaceExplorerRow } from "./WorkspaceExplorerRow";

type Props = {
  rows: readonly RenderRow[];
  virtualizer: Virtualizer<HTMLDivElement, Element>;
};

/** The workspace tree as one flat, virtualized WAI-ARIA tree: only the lines in view
 *  are in the DOM, each absolutely placed at its offset inside a list as tall as all
 *  of them. */
export const ExplorerVirtualList: React.FC<Props> = ({ rows, virtualizer }) => (
  <ul role="tree" aria-label="Workspace files" className="relative m-0 p-0" style={{ height: virtualizer.getTotalSize() }}>
    {virtualizer.getVirtualItems().map((line) => {
      const row = rows[line.index];
      if (!row) return null;
      const placement = { index: line.index, start: line.start, measure: virtualizer.measureElement };
      if (row.type === "item") return <WorkspaceExplorerRow key={line.key} item={row.item} placement={placement} />;
      if (row.type === "status") return <ExplorerStatusRow key={line.key} dir={row.dir} level={row.level} placement={placement} />;
      return <ExplorerCreateRow key={line.key} level={row.level} kind={row.kind} placement={placement} />;
    })}
  </ul>
);
