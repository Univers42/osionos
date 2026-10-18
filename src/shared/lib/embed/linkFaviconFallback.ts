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
// editor reads back from the contenteditable unchanged. Installed once at the app root
// (never torn down), so editor, read-only and public surfaces are all covered and no
// surface unmounting can strip the others' fallback.

const FAVICON_SELECTOR = "img[data-link-favicon]";

function hideBrokenFavicon(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLImageElement && target.matches(FAVICON_SELECTOR)) target.hidden = true;
}

const installedOn = new WeakSet<object>();

/** Idempotent per target: the second call is a no-op. */
export function installLinkFaviconFallback(
  target: Pick<Document, "addEventListener"> = document,
): void {
  if (installedOn.has(target)) return;
  installedOn.add(target);
  target.addEventListener("error", hideBrokenFavicon, true);
}
