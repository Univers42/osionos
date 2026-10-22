/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagramControls.ts                                   +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The look of the controls of the diagram toolbar.
 *
 * The toolbar, the schema checkboxes and the pipeline selects are three
 * pieces of ONE control, so they share one class. It lives here rather than
 * in one of them, so neither has to import the other — the toolbar and the
 * database controls sit on the two sides of the lazy boundary.
 */

/** One select, one checkbox row: the control of the diagram toolbar. */
export const CONTROL =
  "rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-xs text-[var(--osio-fg-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40";
