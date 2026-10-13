/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shortcutLabel.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 05:15:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 05:15:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { formatCombo } from "./combo";
import type { Automation, CommandId } from "./types";

/** The keys that run `commandId` right now ("Ctrl + K"), from the user's own
 *  bindings, or null when no enabled shortcut runs it. */
export function shortcutLabel(automations: readonly Automation[], commandId: CommandId): string | null {
  const bound = automations.find((automation) =>
    automation.enabled && automation.actions.some((action) => action.commandId === commandId));
  return bound ? formatCombo(bound.trigger.combo) : null;
}
