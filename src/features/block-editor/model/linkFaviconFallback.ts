/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   linkFaviconFallback.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


// A link mention's favicon is `<origin>/favicon.ico`, which many sites do not serve.
// `error` does not bubble, so one capture listener on the document hides the broken
// image: the chip then shows its text alone. `hidden` (not removal) keeps the DOM the
// editor reads back from the contenteditable unchanged.

const FAVICON_SELECTOR = "img[data-link-favicon]";

function hideBrokenFavicon(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLImageElement && target.matches(FAVICON_SELECTOR)) target.hidden = true;
}

/** Idempotent; returns the uninstall function. */
export function installLinkFaviconFallback(): () => void {
  document.addEventListener("error", hideBrokenFavicon, true);
  return () => document.removeEventListener("error", hideBrokenFavicon, true);
}
