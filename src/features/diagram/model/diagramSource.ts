/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagramSource.ts                                     +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What a diagram draws (or why it draws nothing).
 *
 * The shape is the same for every kind of the closed spec, so the block has
 * ONE place that turns it into pixels: the hand-written mermaid, the page tree
 * and the database diagrams all hand it a `DiagramSource`.
 */

/** What the block draws (or why it draws nothing). */
export interface DiagramSource {
  /** The mermaid text the locked renderer draws; null when there is none. */
  source: string | null;
  /** True when the diagram holds less than the data (the caps dropped nodes). */
  truncated: boolean;
  /** Why there is no source; null when there is one. */
  error: string | null;
  /** True for a kind of the spec whose adapter does not exist yet. */
  unsupported: boolean;
}
