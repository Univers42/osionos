/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   stripView.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the "For you" strip draws for an answer of the route.
 *
 * PURE. A personalised slate is "For you". When the recommender could not
 * personalise (C48) the route serves the popular order: it is drawn, labelled
 * "Popular" so nobody mistakes it for a personal pick. A user who opted out
 * writes no refusal events, so they get no "Not interested" action.
 */

import type { ForYou, ForYouItem } from "../api/forYou";

/** The strip as drawn: its heading, its cards, its slate, and whether a card can be refused. */
export interface StripView {
  heading: "For you" | "Popular";
  items: ForYouItem[];
  slate: string;
  canRefuse: boolean;
}

/**
 * @param answer the 200 answer of the route
 * @returns the strip to draw, or null when there is nothing to draw
 */
export function stripView(answer: ForYou): StripView | null {
  if (answer.items.length === 0) return null;
  return {
    heading: answer.personalized ? "For you" : "Popular",
    items: answer.items,
    slate: answer.slate ?? "",
    canRefuse: answer.personalized || answer.reason !== "opted_out",
  };
}
