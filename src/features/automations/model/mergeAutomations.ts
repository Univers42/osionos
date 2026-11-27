/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mergeAutomations.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import type { Automation } from "./types";

/**
 * The live shortcut table: every shipped default (the user's replacement of it
 * when they made one) followed by their own rows. Defaults live in code and only
 * the edits are saved, so a default added in a later release reaches existing
 * users without touching what they changed; an override of an id that no longer
 * ships is ignored.
 */
export function mergeAutomations(
  defaults: readonly Automation[],
  overrides: Readonly<Record<string, Automation>>,
  custom: readonly Automation[],
): Automation[] {
  return [...defaults.map((automation) => overrides[automation.id] ?? automation), ...custom];
}
