/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   resultModel.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** A single match inside one block, with surrounding context for display. */
export interface BlockMatch {
  blockId: string;
  before: string;
  hit: string;
  after: string;
}

/** All matches within one page (file), grouped. */
export interface PageGroup {
  pageId: string;
  workspaceId: string;
  title: string;
  editable: boolean;
  archived: boolean;
  matchCount: number;
  matches: BlockMatch[];
}

/** Find + scope options shared by the engine and the replace pass. */
export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  includeGlob: string;
  excludeGlob: string;
  openEditorsOnly: boolean;
}
