/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markengineContract.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Compile-time proof that markengine's block contract still fits this app.
 *
 * markengine declares its own vocabulary so it stays reusable (see
 * `shared/lib/markengine/blockContract.ts`). This file is the single seam where
 * the two are checked against each other: add a block type to the engine that
 * the app does not know, or change `Block`'s required fields, and THIS file
 * fails — one clear error instead of thirty scattered ones.
 */

import type {
  MarkEngineBlock,
  MarkEngineBlockType,
} from '@osionos/markdown-engine/blocks';
import type { Block, BlockType } from './types';

/** `never` (a compile error below) if the engine emits a type the app lacks. */
type EngineTypesAreKnownToApp = MarkEngineBlockType extends BlockType ? true : never;

/** `never` (a compile error below) if an engine block isn't a valid app Block. */
type EngineBlocksAreAppBlocks = MarkEngineBlock extends Block ? true : never;

export const MARKENGINE_CONTRACT_HOLDS: EngineTypesAreKnownToApp &
  EngineBlocksAreAppBlocks = true;
