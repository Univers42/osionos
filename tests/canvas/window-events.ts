/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   window-events.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// This runner's globalThis is not an EventTarget, as the browser's window is. Importing this
// module gives it one, so window-level listeners can be added and fired. Test files run in their
// own process, so the polyfill leaks nowhere.
const eventTarget = new EventTarget();
if (typeof globalThis.addEventListener !== "function") {
  Object.assign(globalThis, {
    addEventListener: eventTarget.addEventListener.bind(eventTarget),
    removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
    dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
  });
}
