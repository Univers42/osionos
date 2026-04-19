/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockCategories.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/19 09:50:36 by vjan-nie          #+#    #+#             */
/*   Updated: 2026/04/19 09:50:41 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Block Category Registry — single source of truth for block type behaviors.
 *
 * This registry replaces all scattered sets and ad-hoc type guards:
 *   - NON_INDENTABLE_TYPES     → isIndentable()
 *   - NON_PARENTABLE_TYPES     → isParentable()
 *   - SELF_RENDERING_CHILDREN  → selfRendersChildren()
 *   - CONTINUES_ON_ENTER       → continuesSameType()
 *   - isListType()             → isListBlock()
 *   - isHeadingType()          → isHeadingBlock()
 *   - isTodoType()             → block.type === 'to_do'
 *
 * Adding a new block type = adding one entry to BLOCK_CATEGORIES.
 * All behavioral decisions across the editor, renderer, and keyboard
 * handlers derive from this registry via the exported helper functions.
 *
 * See BLOCK_PARENTHOOD_PATTERNS.md for design rationale.
 */
import type { BlockType } from "./types";
 
/* ── Category definition ─────────────────────────────────────────── */
 
interface BlockCategory {
  /** Can this block be indented/outdented via Tab/Shift+Tab? */
  indentable: boolean;
 
  /** Can other blocks be indented under this block (become children)? */
  parentable: boolean;
 
  /**
   * Does Enter on this block's content create a child inside it
   * (container behavior) rather than a sibling after it?
   * Examples: toggle (Enter on summary), callout, quote.
   */
  enterCreatesChild: boolean;
 
  /**
   * Does Enter create a new block of the same type as sibling?
   * Examples: bulleted_list, numbered_list, to_do.
   * When true AND the block is empty, Enter converts to paragraph instead.
   */
  continuesSameType: boolean;
 
  /**
   * Does this block render its own children inside its visual container
   * (via renderChildren prop) instead of BlockTree rendering them externally?
   * Examples: callout (inside colored box), quote (inside left border).
   */
  selfRendersChildren: boolean;
 
  /**
   * Should empty+Backspace convert to paragraph instead of deleting?
   * Examples: headings convert to paragraph, callout converts to paragraph.
   */
  backspaceConvertsToParagraph: boolean;
 
  /** Is this a list-type block? (bulleted, numbered, to_do) */
  list: boolean;
 
  /** Is this a heading block? (h1-h6) */
  heading: boolean;
}
 
/* ── Shared presets ──────────────────────────────────────────────── */
 
const HEADING_BASE: BlockCategory = {
  indentable: true,
  parentable: false,
  enterCreatesChild: false,
  continuesSameType: false,
  selfRendersChildren: false,
  backspaceConvertsToParagraph: true,
  list: false,
  heading: true,
};
 
const LIST_BASE: BlockCategory = {
  indentable: true,
  parentable: true,
  enterCreatesChild: false,
  continuesSameType: true,
  selfRendersChildren: false,
  backspaceConvertsToParagraph: false,
  list: true,
  heading: false,
};
 
const LEAF_BASE: BlockCategory = {
  indentable: false,
  parentable: false,
  enterCreatesChild: false,
  continuesSameType: false,
  selfRendersChildren: false,
  backspaceConvertsToParagraph: false,
  list: false,
  heading: false,
};
 
/* ── Registry ────────────────────────────────────────────────────── */
 
const BLOCK_CATEGORIES: Record<BlockType, BlockCategory> = {
  // ─── Text blocks ─────────────────────────────────────
  paragraph: {
    indentable: true,
    parentable: true,
    enterCreatesChild: false,
    continuesSameType: false,
    selfRendersChildren: false,
    backspaceConvertsToParagraph: false,
    list: false,
    heading: false,
  },
 
  // ─── Headings ────────────────────────────────────────
  heading_1: { ...HEADING_BASE },
  heading_2: { ...HEADING_BASE },
  heading_3: { ...HEADING_BASE },
  heading_4: { ...HEADING_BASE },
  heading_5: { ...HEADING_BASE },
  heading_6: { ...HEADING_BASE },
 
  // ─── Lists ───────────────────────────────────────────
  bulleted_list: { ...LIST_BASE },
  numbered_list: { ...LIST_BASE },
  to_do: { ...LIST_BASE },
 
  // ─── Container blocks ───────────────────────────────
  toggle: {
    indentable: true,
    parentable: true,
    enterCreatesChild: true,
    continuesSameType: false,
    selfRendersChildren: false,
    backspaceConvertsToParagraph: true,
    list: false,
    heading: false,
  },
  callout: {
    indentable: true,
    parentable: true,
    enterCreatesChild: true,
    continuesSameType: false,
    selfRendersChildren: true,
    backspaceConvertsToParagraph: true,
    list: false,
    heading: false,
  },
  quote: {
    indentable: true,
    parentable: true,
    enterCreatesChild: true,
    continuesSameType: false,
    selfRendersChildren: true,
    backspaceConvertsToParagraph: true,
    list: false,
    heading: false,
  },
 
  // ─── Specialized / leaf blocks ──────────────────────
  code: { ...LEAF_BASE },
  divider: { ...LEAF_BASE },
  table_block: { ...LEAF_BASE },
  database_inline: { ...LEAF_BASE },
  database_full_page: { ...LEAF_BASE },
  image: { ...LEAF_BASE },
  video: { ...LEAF_BASE },
  audio: { ...LEAF_BASE },
  file: { ...LEAF_BASE },
};
 
/* ── Public API ──────────────────────────────────────────────────── */
 
/** Get the full category descriptor for a block type. */
export function getBlockCategory(type: BlockType): BlockCategory {
  return BLOCK_CATEGORIES[type];
}
 
/** Can this block be indented/outdented via Tab? */
export function isIndentable(type: BlockType): boolean {
  return BLOCK_CATEGORIES[type].indentable;
}
 
/** Can other blocks be nested under this block? */
export function isParentable(type: BlockType): boolean {
  return BLOCK_CATEGORIES[type].parentable;
}
 
/** Does Enter create a child inside this block (container behavior)? */
export function enterCreatesChild(type: BlockType): boolean {
  return BLOCK_CATEGORIES[type].enterCreatesChild;
}
 
/** Does Enter create a same-type sibling (list continuation)? */
export function continuesSameType(type: BlockType): boolean {
  return BLOCK_CATEGORIES[type].continuesSameType;
}
 
/** Does this block render children inside its visual container? */
export function selfRendersChildren(type: BlockType): boolean {
  return BLOCK_CATEGORIES[type].selfRendersChildren;
}
 
/** Should Backspace on empty convert to paragraph instead of deleting? */
export function backspaceConvertsToParagraph(type: BlockType): boolean {
  return BLOCK_CATEGORIES[type].backspaceConvertsToParagraph;
}
 
/** Is this a list-type block (bulleted, numbered, to_do)? */
export function isListBlock(type: BlockType): boolean {
  return BLOCK_CATEGORIES[type].list;
}
 
/** Is this a heading block (h1-h6)? */
export function isHeadingBlock(type: BlockType): boolean {
  return BLOCK_CATEGORIES[type].heading;
}
