/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ReadOnlyBlockList.tsx                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Siblings rendered read-only. The one place that hands ReadOnlyBlock its
// `index`, so every read-only list numbers by run like the editor does (#328).

import React from "react";

import type { Block } from "../model/types";
import { readOnlyListIndexes } from "../model/listStyle";
import { ReadOnlyBlock } from "./ReadOnlyBlock";

interface ReadOnlyBlockListProps {
  blocks: readonly Block[];
  bulletDepth?: number;
  numberedDepth?: number;
  wideBlock?: boolean;
}

export const ReadOnlyBlockList: React.FC<ReadOnlyBlockListProps> = ({ blocks, bulletDepth, numberedDepth, wideBlock }) => {
  const indexes = readOnlyListIndexes(blocks);
  return (
    <>
      {blocks.map((block, position) => (
        <ReadOnlyBlock
          key={block.id}
          block={block}
          index={indexes[position]}
          bulletDepth={bulletDepth}
          numberedDepth={numberedDepth}
          wideBlock={wideBlock}
        />
      ))}
    </>
  );
};
