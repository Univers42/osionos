/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dispatchGuards.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


interface KeyFacts {
  defaultPrevented: boolean;
  isComposing: boolean;
  keyCode: number;
}

/** keyCode 229 is what a browser reports for a key an input method consumed. */
const IME_KEY_CODE = 229;

/**
 * True when a key is not the shortcut table's to take: an earlier handler already
 * claimed it, an input method is composing, or a modal dialog is open (it owns
 * the keyboard even when focus has slipped to the page behind it).
 */
export function keyIsOwnedElsewhere(event: KeyFacts, modalOpen: boolean): boolean {
  return event.defaultPrevented || event.isComposing || event.keyCode === IME_KEY_CODE || modalOpen;
}
