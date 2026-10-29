/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   whyText.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The sentence that explains a page of the slate.
 *
 * PURE, and it reads ONE field: the title of the page the USER touched. No
 * other user is ever named — the route never sends one (C55), and this
 * function could not name one even if it did.
 */

import type { ForYouWhy } from "../api/forYou";

/** The longest title a sentence shows before it is cut. */
const TITLE_LIMIT = 60;

/** The sentence of a "because": the page of the user's own, cut short. */
function becauseText(why: Extract<ForYouWhy, { kind: "because" }>): string {
  const title = String(why.title ?? "").trim();
  // A page with no title is still a page of their own: the sentence says the
  // event, and does not invent a title.
  if (title === "") return `Because you ${why.event} it`;
  const cut = title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT)}…` : title;
  return `Because you ${why.event} “${cut}”`;
}

/**
 * The sentence that explains a page of the slate.
 *
 * @param why the reason the route gave for the page
 * @returns the sentence, ready to be shown
 */
export function whyText(why: ForYouWhy | null | undefined): string {
  if (why?.kind === "popular") return "Popular with readers";
  if (!why || why.kind !== "because") return "Suggested from your activity";
  return becauseText(why);
}
