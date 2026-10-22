/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiContext.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the assistant is pointed at: pages of the workspace, or the workspace
 * itself.
 *
 * The service searches the pages it is given, and — when the caller says so —
 * the caller's whole workspace. The client owns the choice: the composer picks
 * the pages, the chips carry them, and the run carries them to the service.
 *
 * Pure logic: no React, no store. The composer and the store share it.
 */

/** A chip of the composer: one page, or the whole workspace. */
export interface ContextChip {
  /** A stable id for the chip (the page id, or `workspace`). */
  id: string;
  kind: "page" | "workspace";
  /** What the chip reads: the page title, or "Whole workspace". */
  label: string;
  /** The page the chip points at — a workspace chip has none. */
  pageId?: string;
}

/** The context a run is sent with — the wire contract's `context` body. */
export interface RunContext {
  /** The pages the service reads: at most three. */
  pageIds: string[];
  /** True when the service searches the caller's whole workspace. */
  workspace: boolean;
}

/** How many pages one run may be pointed at. */
export const MAX_CONTEXT_PAGES = 3;

/** The chip of the whole workspace. */
export const WORKSPACE_CHIP: ContextChip = {
  id: "workspace",
  kind: "workspace",
  label: "Whole workspace",
};

/** The answer of a pick: the chips, and the line to say when it is refused. */
export interface ChipPick {
  chips: ContextChip[];
  /** One line for the reader — set when the pick was refused. */
  refusal: string | null;
}

/**
 * Adds a chip to the list.
 *
 * The same page twice is not a second page: it stays one chip. A FOURTH page
 * is refused — the service reads three pages at most — and the reader is told
 * so in one line. The workspace is one chip, however many times it is picked.
 */
export function addContextChip(chips: ContextChip[], chip: ContextChip): ChipPick {
  const sameId = chips.some((existing) => existing.id === chip.id);
  if (sameId) return { chips, refusal: null };

  if (chip.kind === "page") {
    const pages = chips.filter((existing) => existing.kind === "page");
    if (pages.length >= MAX_CONTEXT_PAGES) {
      return {
        chips,
        refusal: `Up to ${MAX_CONTEXT_PAGES} pages at a time — remove one to add another.`,
      };
    }
  }
  return { chips: [...chips, chip], refusal: null };
}

/** The chips as the run's context: the pages, and whether the workspace is read. */
export function buildRunContext(chips: ContextChip[]): RunContext {
  return {
    pageIds: chips.filter((chip) => chip.kind === "page" && chip.pageId).map((chip) => chip.pageId as string),
    workspace: chips.some((chip) => chip.kind === "workspace"),
  };
}

/** The "@" that opens the picker, with what the reader typed after it. */
export interface ContextTrigger {
  /** What the reader typed after the "@". */
  query: string;
  /** Where the "@" is in the text. */
  start: number;
}

/**
 * The "@" trigger of the composer.
 *
 * The "@" must stand alone — at the start of the text or after a space — so an
 * email address ("a@b.fr") never opens the picker.
 */
export function contextTrigger(text: string, caret: number): ContextTrigger | null {
  const head = text.slice(0, caret);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(head);
  if (!match) return null;
  const query = match[1];
  return { query, start: caret - query.length - 1 };
}
